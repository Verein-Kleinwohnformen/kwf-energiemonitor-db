const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const axios = require('axios');

module.exports = function(RED) {
    function KWFEnergieMonitor(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Retrieve configuration options
        const dbInput = config.sqlitePath || '/data/node-red/kwfemon/';  // Default if not set
        const apiKey = config.apiKey || '';
        const apiURL = config.apiURL || '';
        const sendInterval = config.sendInterval || 3600000;  // Default 1 hour
        
        // Enabling us to change the data format for future updates and using new databases in these cases
        const dbPath = path.join(dbInput, 'buffer_v1.db');

        // Ensure the directory for the SQLite database exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // Open SQLite database (this creates the file if it doesn't exist)
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                node.error('Error opening database:', err);
            } else {
                node.log(`Database opened or created at ${dbPath}`);
            }
        });

        // Create table if it doesn't exist
        db.run(`CREATE TABLE IF NOT EXISTS buffer_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            netatmo_indoor_id TEXT,
            indoor_reachable BOOLEAN,
            indoor_signal INTEGER,
            indoor_temperature REAL,
            indoor_humidity REAL,
            indoor_co2 REAL,
            indoor_pressure REAL,
            outdoor_reachable BOOLEAN,
            netatmo_outdoor_id TEXT,
            outdoor_temperature REAL,
            outdoor_humidity REAL,
            outdoor_battery INTEGER,
            outdoor_signal INTEGER,
            warning TEXT,
            sensor TEXT,
            sentToDB INTEGER DEFAULT 0
        );`, (err) => {
            if (err) {
                node.error('Error creating table:', err);
            } else {
                node.log('Table "buffer_data" is ready');
            }
        });

        // Function to send data to the API
        async function sendToAPI(data) {
            try {
                const response = await axios.post(apiURL, data, {
                    headers: { 
                        'Content-Type': 'application/json',
                        'KWF-Device-Key': apiKey  // Add API key to request header
                    }
                });
                node.log(`API Response: ${response.status} - ${response.statusText}`);
                return true;
            } catch (error) {
                node.error(`API Error: ${error.message}`);
                return false;
            }
        }

        // Read data from SQLite where sentToDB = 0 (not yet sent to API)
        function readDatabase() {
            db.all(`SELECT * FROM buffer_data WHERE sentToDB = 0`, [], async (err, rows) => {
                if (err) {
                    node.error('Error reading from database:', err);
                    return;
                }

                if (rows.length > 0) {
                    // Aggregate all rows into a single object/array to send to API
                    const dataToSend = rows.map(row => {
                        const { sentToDB, ...data } = row;
                        return data;
                    });

                    // Split data into smaller chunks if there are more than MAX_ROWS
                    const chunks = [];
                    for (let i = 0; i < dataToSend.length; i += 1000) {
                        chunks.push(dataToSend.slice(i, i + 1000));
                    }

                    // Send each chunk to the API
                    for (let chunk of chunks) {
                        const success = await sendToAPI(chunk);

                        if (success) {
                            // Update sentToDB to 1 (sent) for all rows in the batch
                            const timestamps = chunk.map(item => item.timestamp);
                            db.run(`UPDATE buffer_data SET sentToDB = 1 WHERE timestamp IN (${timestamps.join(',')})`, function(err) {
                                if (err) {
                                    node.error('Error updating sentToDB:', err);
                                }
                            });
                        } else {
                            node.error('Error sending data to API');
                        }
                    }
                }
            });
        }

        // Write data to SQLite database
        function writeDatabase(data) {
            const {
                timestamp, netatmo_indoor_id, indoor_reachable, indoor_signal, indoor_temperature,
                indoor_humidity, indoor_co2, indoor_pressure, outdoor_reachable, netatmo_outdoor_id,
                outdoor_temperature, outdoor_humidity, outdoor_battery, outdoor_signal, warning, sensor
            } = data;

            db.get(`SELECT * FROM buffer_data WHERE timestamp = ?`, [timestamp], (err, row) => {
                if (err) {
                    node.error('Error checking for existing timestamp:', err);
                    return;
                }

                if (row) {
                    // Update existing record
                    db.run(`UPDATE buffer_data SET 
                                netatmo_indoor_id = ?, indoor_reachable = ?, indoor_signal = ?, indoor_temperature = ?, 
                                indoor_humidity = ?, indoor_co2 = ?, indoor_pressure = ?, outdoor_reachable = ?, 
                                netatmo_outdoor_id = ?, outdoor_temperature = ?, outdoor_humidity = ?, 
                                outdoor_battery = ?, outdoor_signal = ?, warning = ?, sensor = ? 
                            WHERE timestamp = ?`, 
                            [netatmo_indoor_id, indoor_reachable, indoor_signal, indoor_temperature, indoor_humidity, 
                            indoor_co2, indoor_pressure, outdoor_reachable, netatmo_outdoor_id, outdoor_temperature, 
                            outdoor_humidity, outdoor_battery, outdoor_signal, warning, sensor, timestamp], 
                            (err) => {
                                if (err) {
                                    node.error('Error updating database:', err);
                                }
                            });
                } else {
                    // Insert new record
                    db.run(`INSERT INTO buffer_data (timestamp, netatmo_indoor_id, indoor_reachable, indoor_signal, 
                            indoor_temperature, indoor_humidity, indoor_co2, indoor_pressure, outdoor_reachable, 
                            netatmo_outdoor_id, outdoor_temperature, outdoor_humidity, outdoor_battery, outdoor_signal, 
                            warning, sensor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                            [timestamp, netatmo_indoor_id, indoor_reachable, indoor_signal, indoor_temperature, 
                            indoor_humidity, indoor_co2, indoor_pressure, outdoor_reachable, netatmo_outdoor_id, 
                            outdoor_temperature, outdoor_humidity, outdoor_battery, outdoor_signal, warning, sensor], 
                            (err) => {
                                if (err) {
                                    node.error('Error inserting into database:', err);
                                }
                            });
                }
            });
        }

        // Parse incoming data and add timestamp
        function parseData(data, sensor) {
            // Add timestamp and sensor to the data
            const timestampedData = {
                ...data,
                timestamp: Math.floor(Date.now() / 1000),  // Current Unix timestamp (seconds)
                sensor: sensor
            };
            writeDatabase(timestampedData);
        }

        // Set up the timer for sending the buffer every hour
        setInterval(() => {
            readDatabase();  // Read and send buffer data every hour
        }, sendInterval);

        node.on('input', function(msg, send, done) {
            if (!msg.payload) {
                node.error('Invalid message: Missing payload');
                return done();
            }

            const topic = msg.topic;
            let data = {};
            
            // Parse incoming data based on the topic
            switch (topic) {
                case 'netatmo':
                    data = msg.payload;
                    parseData(data, 'netatmo');
                    break;
                case 'temperature_indoor':
                    data = {
                        indoor_temperature: msg.payload
                    };
                    parseData(data, 'custom_temperature');
                    break;
                case 'temperature_outdoor':
                    data = {
                        outdoor_temperature: msg.payload
                    };
                    parseData(data, 'custom_temperature');
                    break;
                case 'humidity_indoor':
                    data = {
                        indoor_humidity: msg.payload
                    };
                    parseData(data, 'custom_humidity');
                    break;
                case 'humidity_outdoor':
                    data = {
                        outdoor_humidity: msg.payload
                    };
                    parseData(data, 'custom_humidity');
                    break;
                default:
                    node.error('Invalid message: Missing or unknown topic');
                    return done();
            }

            if (done) { done(); }
        });
    }

    RED.nodes.registerType("kwf-energiemonitor", KWFEnergieMonitor);
};