# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.2] - 2025-10-22

### Added

- **Universal `ts_` prefix system for per-value timestamps**: The node now supports individual timestamps for each measurement value
  - Values with a `ts_` prefix (e.g., `ts_temperature_indoor`) are stored with their specific measurement timestamp
  - Multiple values with different timestamps in a single payload are automatically split into separate database records
  - Non-timestamped values are merged into all records, ensuring metadata is preserved
  - Fully backward compatible: works with or without `ts_` prefixed values
- Updated Netatmo decoder to use `ts_` prefixes for accurate measurement timestamps
  - Each sensor value now includes its exact measurement time from the Netatmo device
  - Prevents duplicate entries while maintaining precise temporal accuracy

### Changed

- Enhanced `writeDatabase()` function to intelligently process timestamped values
- Improved Netatmo decoder to store device timestamps with each measurement
- Database records now reflect actual measurement times rather than polling times

### Fixed

- Resolved issue where Netatmo data appeared to update only every 10 minutes despite more frequent polling
- Timestamp accuracy now preserved for sensors that update at their own intervals

## [0.4.1] - 2025-10-10

### Added

- Enhanced Netatmo weather station support with comprehensive data extraction
- Support for both indoor and outdoor sensor modules
- New measurement point "K0" for general comfort sensors

### Changed

- **BREAKING CHANGE**: Updated input data format to use standardized structure:
  - All data now in `msg.payload` with `sensor_id`, `timestamp`, `metering_point`, and `values`
  - Removed dependency on `msg.topic` for sensor identification
- Improved Netatmo decoder with better value naming and data structure mapping
- Enhanced decode_netatmo.js to handle new Netatmo API format with device filtering
- Updated documentation with new sensor types table showing Shelly 3EM Pro and Netatmo devices

### Fixed

- Fixed SQL syntax error with reserved word "values" by renaming database column to "measurements"
- Improved database schema design to avoid SQL reserved word conflicts
- Enhanced error handling in Netatmo data processing

## [0.3.1] - 2025-04-04

### Added

- No new features in this release

### Changed

- Migrated from `sqlite3` to `better-sqlite3` for improved performance and fewer dependencies
- Improved error handling in database operations

### Fixed

- Fixed issue with path handling in database connection
- Addressed deprecated package warnings

## [0.3.0] - 2025-03-15

### Added

- New `victron_ac_l1_p` topic support for monitoring AC power consumption from Victron systems

### Changed

- Optimized database queries for better performance
- Updated documentation with examples

## [0.2.0] - 2025-02-20

### Added

- Initial support for Netatmo weather station data
- Added API connectivity for sending data to KWF servers
- Implemented buffering mechanism for offline operation

### Changed

- Improved logging for better troubleshooting

## [0.1.0] - 2025-01-10

### Added

- Initial release
- Basic Node-RED integration
- SQLite database setup for data storage