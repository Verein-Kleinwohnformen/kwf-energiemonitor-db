const path = require('path');
const Database = require('better-sqlite3');
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
        const dbPath = path.join(dbInput, 'buffer_v2.db');
        let db; // Moved db declaration here

        // Ensure the directory for the SQLite database exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        try {
            // Open SQLite database (this creates the file if it doesn't exist)
            // better-sqlite3 is synchronous, so we use try/catch instead of callbacks
            db = new Database(dbPath);
            node.log(`Database opened or created at ${dbPath}`);
        } catch (err) {
            node.error(`Error opening database: ${err.message}`);
            return;
        }

        // Create table if it doesn't exist (synchronous in better-sqlite3)
        try {
            db.exec(`CREATE TABLE IF NOT EXISTS buffer_data (
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
                ac_l1_p REAL,
                sensor TEXT,
                sentToDB INTEGER DEFAULT 0
            );`);
            node.log('Table "buffer_data" is ready');
        } catch (err) {
            node.error(`Error creating table: ${err.message}`);
            return;
        }

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
        async function readDatabase() {
            try {
                // better-sqlite3 uses prepared statements that are executed synchronously
                const stmt = db.prepare('SELECT * FROM buffer_data WHERE sentToDB = 0');
                const rows = stmt.all(); // Get all results at once

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
                            try {
                                const updateStmt = db.prepare(`UPDATE buffer_data SET sentToDB = 1 WHERE timestamp IN (${timestamps.join(',')})`);
                                updateStmt.run();
                            } catch (err) {
                                node.error(`Error updating sentToDB: ${err.message}`);
                            }
                        } else {
                            node.error('Error sending data to API');
                        }
                    }
                }
            } catch (err) {
                node.error(`Error reading from database: ${err.message}`);
            }
        }

        // Write data to SQLite database
        function writeDatabase(data) {
            const {
                timestamp, netatmo_indoor_id, indoor_reachable, indoor_signal, indoor_temperature,
                indoor_humidity, indoor_co2, indoor_pressure, outdoor_reachable, netatmo_outdoor_id,
                outdoor_temperature, outdoor_humidity, outdoor_battery, outdoor_signal, warning, 
                ac_l1_p, sensor
            } = data;

            try {
                // Check if record already exists
                const checkStmt = db.prepare('SELECT * FROM buffer_data WHERE timestamp = ?');
                const existingRow = checkStmt.get(timestamp);

                if (existingRow) {
                    // Update existing record
                    const updateStmt = db.prepare(`UPDATE buffer_data SET 
                        netatmo_indoor_id = ?, indoor_reachable = ?, indoor_signal = ?, indoor_temperature = ?, 
                        indoor_humidity = ?, indoor_co2 = ?, indoor_pressure = ?, outdoor_reachable = ?, 
                        netatmo_outdoor_id = ?, outdoor_temperature = ?, outdoor_humidity = ?, 
                        outdoor_battery = ?, outdoor_signal = ?, warning = ?, ac_l1_p = ?, sensor = ? 
                    WHERE timestamp = ?`);
                    
                    updateStmt.run(
                        netatmo_indoor_id, indoor_reachable, indoor_signal, indoor_temperature, indoor_humidity,
                        indoor_co2, indoor_pressure, outdoor_reachable, netatmo_outdoor_id, outdoor_temperature,
                        outdoor_humidity, outdoor_battery, outdoor_signal, warning, ac_l1_p, sensor, timestamp
                    );
                } else {
                    // Insert new record
                    const insertStmt = db.prepare(`INSERT INTO buffer_data (
                        timestamp, netatmo_indoor_id, indoor_reachable, indoor_signal, indoor_temperature, 
                        indoor_humidity, indoor_co2, indoor_pressure, outdoor_reachable, netatmo_outdoor_id, 
                        outdoor_temperature, outdoor_humidity, outdoor_battery, outdoor_signal, warning, 
                        ac_l1_p, sensor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                    
                    insertStmt.run(
                        timestamp, netatmo_indoor_id, indoor_reachable, indoor_signal, indoor_temperature,
                        indoor_humidity, indoor_co2, indoor_pressure, outdoor_reachable, netatmo_outdoor_id,
                        outdoor_temperature, outdoor_humidity, outdoor_battery, outdoor_signal, warning,
                        ac_l1_p, sensor
                    );
                }
            } catch (err) {
                node.error(`Database error: ${err.message}`);
            }
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
        const intervalId = setInterval(() => {
            readDatabase();  // Read and send buffer data every hour
        }, sendInterval);

        // Clean up when node is closed
        this.on('close', function(done) {
            clearInterval(intervalId);
            if (db) {
                db.close();
            }
            done();
        });

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
                case 'victron_ac_l1_p':
                    data = {
                        ac_l1_p: msg.payload
                    };
                    parseData(data, 'victron');
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