const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const axios = require('axios');

module.exports = function(RED) {
    function KWFEnergieMonitor(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Retrieve configuration options
        const dbPath = config.sqlitePath || '/data/node-red/buffer.db';  // Default if not set
        const apiKey = config.apiKey || '';  // Default if not set

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
            timestamp INTEGER PRIMARY KEY,
            temperature REAL,
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
                const response = await axios.post('https://europe-west6-energiemonitor-kwf.cloudfunctions.net/telemetry-api', data, {
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
                    const dataToSend = rows.map(row => ({
                        timestamp: row.timestamp,
                        temperature: row.temperature
                    }));

                    // Send the aggregated data
                    const success = await sendToAPI(dataToSend);

                    if (success) {
                        // Update sentToDB to 1 (sent) for all rows in the batch
                        const timestamps = rows.map(row => row.timestamp);
                        db.run(`UPDATE buffer_data SET sentToDB = 1 WHERE timestamp IN (${timestamps.join(',')})`, function(err) {
                            if (err) {
                                node.error('Error updating sentToDB:', err);
                            }
                        });
                    }
                }
            });
        }

        // Write data to SQLite database
        function writeDatabase(data) {
            const { timestamp, temperature } = data;

            db.get(`SELECT * FROM buffer_data WHERE timestamp = ?`, [timestamp], (err, row) => {
                if (err) {
                    node.error('Error checking for existing timestamp:', err);
                    return;
                }

                if (row) {
                    // Update existing record
                    db.run(`UPDATE buffer_data SET temperature = ? WHERE timestamp = ?`, [temperature, timestamp], (err) => {
                        if (err) {
                            node.error('Error updating database:', err);
                        }
                    });
                } else {
                    // Insert new record
                    db.run(`INSERT INTO buffer_data (timestamp, temperature) VALUES (?, ?)`, [timestamp, temperature], (err) => {
                        if (err) {
                            node.error('Error inserting into database:', err);
                        }
                    });
                }
            });
        }

        // Parse incoming data and add timestamp
        function parseData(data, field) {
            // Add timestamp and parse field data
            const timestampedData = {
                [field]: data[field],
                timestamp: Math.floor(Date.now() / 1000)  // Current Unix timestamp (seconds)
            };
            writeDatabase(timestampedData);
        }

        // Set up the timer for sending the buffer every hour
        setInterval(() => {
            readDatabase();  // Read and send buffer data every hour
        }, 20000);  // 3600000 1 hour in milliseconds

        node.on('input', function(msg, send, done) {
            if (!msg.topic || !msg.payload) {
                node.error('Invalid message: Missing topic or payload');
                return done();
            }

            let isValid = false;
            let fieldName = "";
            if (msg.topic === "temp_in" || msg.topic === "temp_out") {
                if (typeof msg.payload.temperature === 'number') {
                    fieldName = "temperature";
                    isValid = true;
                }
            } 

            if (!isValid) {
                node.error('Invalid topic or payload format');
                return done();
            }

            // Parse and save incoming data to buffer
            parseData(msg.payload, fieldName);

            if (done) { done(); }
        });
    }

    RED.nodes.registerType("kwf-energiemonitor", KWFEnergieMonitor);
};
