## 1.0.2

### Roadmap

- Developing new exchange rate functionality to support more currency types
- Collecting more accurate historical Wb data
- Refactoring Path Builder to make its operation more in line with the logic of building CCU chains

### New Features

- Added a Path Builder for automatic path construction
- Data in the hangar can now be persistently stored
- The hangar now supports multiple accounts
- Added an indicator to show whether a ship's CCU can currently be purchased in the RSI store

### Bug Fixes

- Fixed first screen loading style error on MacOS and Linux
- Set up new automated tasks to capture RSI data, filling in missing ships in the database

### UI

- Changed the navigation bar style

## 1.0.1

### New Features

- Now you can click the "Show Historical WB" checkbox to view historical War Bond data, and also choose to apply historical War Bond when editing paths in ship nodes
- Added ship flight-ready status indicators, marking ships' flight status (for currently non-flight-ready ships and upcoming flight-ready ships)
- If a ship currently has War Bonds available, an indicator will be displayed on the card
- Now you can delete individual connections; click the "Edit path" button to manage incoming connections in the upgrade path
- You can now manually turn pruning optimization on or off to improve performance or display all available routes
- Click the copy button on the ship card to copy the current node

### Bug Fixes

- Fixed several bugs that could cause a white screen after connecting to the hangar
- Fixed some bugs where CCUs could not be correctly identified
- Fixed a spelling error (thanks to neverphate for pointing this out)

### UI

- Added a dark mode
- Modified some color configurations

### Known Issues

- Historical War Bond data may not be accurate and needs verification

## 1.0.0

### New Features

- Ship upgrade planning tool launched
