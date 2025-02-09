# NodeRED Connector für KWF Energiemonitor

### Installation
Im Moment kann dieser Node nur über Github installiert werden. Direkt in Balena (node-red Terminal) in den folgenden Ordner gehen und von Git installieren: 
```
cd ../../data/node-red/user/node_modules/
npm install https://github.com/Verein-Kleinwohnformen/kwf-energiemonitor-db.git
```

### Topics
Damit dieser Node verschiedene Input-Daten unterscheiden kann, müssen die Topics von NodeRED verwendet werden. Momentan werden folgende Topics unterstützt:
- temp_in: Innentemperatur. Wenn mehrere Werte gemessen werden, bitte vorher einen Durchschnitt bilden.
- temp_out: Aussentemperatur
