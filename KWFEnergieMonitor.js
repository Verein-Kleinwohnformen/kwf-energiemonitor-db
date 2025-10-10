/*
 * KWF Energiemonitor NodeRED Node
 * 
 * NodeRED Node Development Documentation:
 * - Creating Nodes: https://nodered.org/docs/creating-nodes/
 * - JavaScript File: https://nodered.org/docs/creating-nodes/node-js
 * - Node Properties: https://nodered.org/docs/creating-nodes/properties
 * - Node Context: https://nodered.org/docs/creating-nodes/context
 */

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
        const dbPath = path.join(dbInput, 'buffer_v3.db');
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
            db.exec(`CREATE TABLE IF NOT EXISTS sensor_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                sensor_id TEXT NOT NULL,
                metering_point TEXT NOT NULL,
                measurements TEXT NOT NULL,  -- JSON string of the sensor measurements
                sentToDB INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            );`);
            
            // Create index for better performance
            db.exec(`CREATE INDEX IF NOT EXISTS idx_sensor_data_timestamp ON sensor_data(timestamp);`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_sensor_data_sent ON sensor_data(sentToDB);`);
            db.exec(`CREATE INDEX IF NOT EXISTS idx_sensor_data_metering_point ON sensor_data(metering_point);`);
            
            node.log('Table "sensor_data" is ready');
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
                const stmt = db.prepare('SELECT * FROM sensor_data WHERE sentToDB = 0');
                const rows = stmt.all(); // Get all results at once

                if (rows.length > 0) {
                    // Process data and parse JSON values back to objects
                    const dataToSend = rows.map(row => {
                        const { sentToDB, created_at, measurements, ...data } = row;
                        // Parse the JSON measurements back to values object for API
                        try {
                            data.values = JSON.parse(measurements);
                        } catch (err) {
                            node.error(`Error parsing measurements JSON for row ${data.id}: ${err.message}`);
                            data.values = {};
                        }
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
                            const ids = chunk.map(item => item.id);
                            try {
                                const updateStmt = db.prepare(`UPDATE sensor_data SET sentToDB = 1 WHERE id IN (${ids.join(',')})`);
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
            const { timestamp, sensor_id, metering_point, values } = data;

            // Validate required fields
            if (!sensor_id || !metering_point || !values || !timestamp) {
                node.error('Missing required fields: sensor_id, metering_point, values, or timestamp');
                return;
            }

            try {
                // Convert values object to JSON string for storage as measurements
                const measurementsJson = JSON.stringify(values);

                // Check if record already exists (same sensor, timestamp, and metering point)
                const checkStmt = db.prepare('SELECT * FROM sensor_data WHERE timestamp = ? AND sensor_id = ? AND metering_point = ?');
                const existingRow = checkStmt.get(timestamp, sensor_id, metering_point);

                if (existingRow) {
                    // Update existing record
                    const updateStmt = db.prepare(`UPDATE sensor_data SET 
                        measurements = ?, sentToDB = 0 
                    WHERE timestamp = ? AND sensor_id = ? AND metering_point = ?`);
                    
                    updateStmt.run(measurementsJson, timestamp, sensor_id, metering_point);
                    node.log(`Updated existing record for sensor ${sensor_id}, metering point ${metering_point}`);
                } else {
                    // Insert new record
                    const insertStmt = db.prepare(`INSERT INTO sensor_data (
                        timestamp, sensor_id, metering_point, measurements) VALUES (?, ?, ?, ?)`);
                    
                    insertStmt.run(timestamp, sensor_id, metering_point, measurementsJson);
                    node.log(`Inserted new record for sensor ${sensor_id}, metering point ${metering_point}`);
                }
            } catch (err) {
                node.error(`Database error: ${err.message}`);
            }
        }

        // Parse incoming data
        function parseData(payload) {
            // Validate the new data format
            if (!payload.sensor_id || !payload.metering_point || !payload.values) {
                node.error('Invalid payload format. Required: sensor_id, metering_point, values');
                return;
            }

            // Use provided timestamp or create new one
            const timestamp = payload.timestamp || Date.now();
            
            const data = {
                sensor_id: payload.sensor_id,
                metering_point: payload.metering_point,
                values: payload.values,
                timestamp: timestamp
            };
            
            writeDatabase(data);
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

            // New format: all data in payload, no topic needed
            try {
                parseData(msg.payload);
                node.log(`Processed data from sensor ${msg.payload.sensor_id} for metering point ${msg.payload.metering_point}`);
            } catch (error) {
                node.error(`Error processing input data: ${error.message}`);
            }

            if (done) { done(); }
        });
    }

    RED.nodes.registerType("kwf-energiemonitor", KWFEnergieMonitor);
};