var addr = env.get('NETATMO_ADDRESS');
var devices = msg.payload.body.devices;

// Initialize the new data format structure
var data = {
    sensor_id: "netatmo",
    timestamp: Date.now(), // Current timestamp in milliseconds
    metering_point: "K0", // Placeholder measurement point
    values: {}
};

// Loop through all devices found
for (let i = 0; i < devices.length; i++) {
    if (devices[i]._id == addr){
        // Store device identifiers
        data.values["device_id"] = devices[i]._id;
        
        var indoor_data = devices[i].dashboard_data;
        data.values["device_reachable"] = devices[i].reachable;

        // Use the timestamp from the device data if available
        if (indoor_data.time_utc) {
            data.timestamp = indoor_data.time_utc * 1000; // Convert to milliseconds
        }

        if (devices[i].reachable) {
            // Indoor sensor data (from devices[i].dashboard_data)
            data.values["wifi_signal_strength"] = devices[i].wifi_status;
            data.values["temperature_indoor"] = indoor_data.Temperature;
            data.values["humidity_indoor"] = indoor_data.Humidity;
            data.values["co2_indoor"] = indoor_data.CO2;
            data.values["pressure"] = indoor_data.Pressure;
            data.values["noise_level"] = indoor_data.Noise;
            data.values["pressure_absolute"] = indoor_data.AbsolutePressure;

            // Outdoor modules data (from devices[i].modules[j])
            var modules = devices[i].modules;
            if (modules && modules.length > 0) {
                for (let j = 0; j < modules.length; j++) {
                    // Read data of the first module only (outdoor sensor)
                    if (j==0) {
                        data.values["outdoor_module_reachable"] = modules[j].reachable;
                        data.values["outdoor_module_id"] = modules[j]._id;

                        if (modules[j].reachable) { 
                            var outdoor_data = modules[j].dashboard_data;
                            // Outdoor sensor data (from devices[i].modules[0].dashboard_data)
                            data.values["temperature_outdoor"] = outdoor_data.Temperature;
                            data.values["humidity_outdoor"] = outdoor_data.Humidity;
                            
                            // Module status data (from devices[i].modules[0])
                            data.values["battery_level"] = modules[j].battery_percent;
                            data.values["rf_signal_strength"] = modules[j].rf_status;
                            data.values["battery_voltage"] = modules[j].battery_vp;
                            
                            // Calculate temperature difference
                            data.values["temperature_difference"] = indoor_data.Temperature - outdoor_data.Temperature;
                        }
                    }
                    if (j>0){
                        data.values["warning"] = "Multiple outdoor modules detected";
                    }
                }
            }
        }
      }
    }

msg.payload = data;
return msg;