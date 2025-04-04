# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2025-04-04

### Added

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