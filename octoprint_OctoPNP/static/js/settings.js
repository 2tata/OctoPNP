$(function() {
    function OctoPNPSettingsViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];
        self.control = parameters[1];
        self.connection = parameters[2];

        self._headCanvas = document.getElementById('headCanvas');

        self.objectPositionX = ko.observable(100.0);
        self.objectPositionY = ko.observable(100.0);

        self.offsetCorrectionX = ko.observable(0.0);
        self.offsetCorrectionY = ko.observable(0.0);
        self.jogDistance = ko.observable(1.0);

        self.selectedHeadExtruder = ko.observable(0);
        self.selectedBedExtruder = ko.observable(1);

        self.extruderOffsetX = ko.observable(0.0);
        self.extruderOffsetY = ko.observable(0.0);

        self.isConnected = ko.computed(function() {
            return self.connection.isOperational() || self.connection.isReady() || self.connection.isPaused();
        });

        self.statusHeadCameraOffset = ko.observable(false);
        self.statusTrayPosition = ko.observable(false);
        self.statusBedCameraOffset = ko.observable(false);
        // delete if pnp offset in eeprom
        self.statusPnpNozzleOffset =  ko.observable(false);

        self.keycontrolPossible = ko.observable(false);
        self.keycontrolActive = ko.observable(false);
        self.showKeycontrols = ko.observable(true);
        self.keycontrolHelpActive = ko.observable(false);

        self.videoStreamActive = ko.observable(false);

        // firmware support detection
        self.firmwareRegEx = /FIRMWARE_NAME:([^\s]+)/i;
        self.supportedFirmWares = Object.freeze({
            repetier: "REPETIER",
            reprapfirmware: "REPRAPFIRMWARE",
            notsupported: "NOTSUPPORTED",
            unknown: "UNKNOWN"
        });

        self.detectedFirmware = self.supportedFirmWares.unknown;
        self.detectedFirmwareInfo = ko.observable("<span style=\"color: red\">Firmware type not detected</span>");
        self.isSupportedFirmware = ko.observable(false);

        // helpers for eeprom access
        self.eepromDataRegEx = /EPR:(\d+) (\d+) ([^\s]+) (.+)/;
        self.eepromData = ko.observableArray([]);


        // This will get called before the ViewModel gets bound to the DOM, but after its depedencies have
        // already been initialized. It is especially guaranteed that this method gets called _after_ the settings
        // have been retrieved from the OctoPrint backend and thus the SettingsViewModel been properly populated.
        self.onBeforeBinding = function() {
            self.settings = self.settings.settings;
        };

        // Home X Y
        self.homeXY = function() {

            self.control.sendCustomCommand({command: "G1 X100 Y150 F3000"});
            self.control.sendCustomCommand({command: "T0"});
            self.control.sendCustomCommand({command: "G28 X Y"});
        };

        self.startVideo = function(url) {
            self.videoStreamActive(true);
            self.videoTimer = setInterval(function(){ self._drawImage(url, true); }, 100);
        };

        self.stopVideo = function() {
            clearInterval(self.videoTimer);
            self.videoStreamActive(false);
        };

        // stop potential video stream when settings dialog is closed
        self.onSettingsHidden = function() {
            self.stopVideo();
        }
        
        // Calibrate offset between primary extruder and head-camera
        self.headCameraOffset = function() {
            //deactivate other processes
            self.statusHeadCameraOffset(true);
            self.statusTrayPosition(false);
            self.statusBedCameraOffset(false);
            // delete if pnp offset in eeprom
            self.statusPnpNozzleOffset(false);
            
            // should we start live preview?
            self.stopVideo();
            if(self.settings.plugins.OctoPNP.camera.head.http_path().length > 0) {
                self.startVideo(self.settings.plugins.OctoPNP.camera.head.http_path());
            }

            // load offsets for given extruder
            self.loadOffsets(self.selectedHeadExtruder());

            // Switch to selected extruder
            //self.control.sendCustomCommand({command: "G1 X100 Y150 F3000"});
            //self.control.sendCustomCommand({command: "T0"});
            self.control.sendCustomCommand({command: "T" + self.selectedHeadExtruder().toString()});

            //move camera to object
            var x = self.objectPositionX() - parseFloat(self.settings.plugins.OctoPNP.camera.head.x());
            var y = self.objectPositionY() - parseFloat(self.settings.plugins.OctoPNP.camera.head.y());
            self.control.sendCustomCommand({command: "G1 X" + x + " Y" + y + " Z" + self.settings.plugins.OctoPNP.camera.head.z() + " F3000"});

            //reset offset correction values
            self.offsetCorrectionX(0.0);
            self.offsetCorrectionY(0.0);

            //activate Keycontrol
            self.keycontrolPossible(true);

            //trigger image fetching
            if(!self.videoStreamActive()) {
                setTimeout(function() {self._getImage('HEAD');}, 8000);
            }
        };

        self.saveHeadCameraOffset = function() {
            //save values...
            self.settings.plugins.OctoPNP.camera.head.x(parseFloat(self.settings.plugins.OctoPNP.camera.head.x())-self.offsetCorrectionX());
            self.settings.plugins.OctoPNP.camera.head.y(parseFloat(self.settings.plugins.OctoPNP.camera.head.y())-self.offsetCorrectionY());

            //deactivate Keycontrol
            self.keycontrolPossible(false);
            self.statusHeadCameraOffset(false);

            // stop potential live video preview
            self.stopVideo();
        };

        // Move Ex to bed camera.
        self.bedCameraPosition = function() {
            //deactivate other processes
            self.statusHeadCameraOffset(false);
            self.statusTrayPosition(false);
            self.statusBedCameraOffset(true);
            // delete if pnp offset in eeprom
            self.statusPnpNozzleOffset(false);

            // should we start live preview?
            self.stopVideo();
            if(self.settings.plugins.OctoPNP.camera.bed.http_path().length > 0) {
                self.startVideo(self.settings.plugins.OctoPNP.camera.bed.http_path());
            }

            // load offsets for given extruder
            self.loadOffsets(self.selectedBedExtruder());

            // Switch to selected extruder
            //self.control.sendCustomCommand({command: "G1 X100 Y150 F3000"});
            self.control.sendCustomCommand({command: "T" + self.selectedBedExtruder().toString()});

            //move tool to camera
            var x = parseFloat(self.settings.plugins.OctoPNP.camera.bed.x());
            var y = parseFloat(self.settings.plugins.OctoPNP.camera.bed.y());
            self.control.sendCustomCommand({command: "G1 X" + x + " Y" + y + " Z" + self.settings.plugins.OctoPNP.camera.bed.z() + " F3000"});

            //reset offset correction values
            self.offsetCorrectionX(0.0);
            self.offsetCorrectionY(0.0);

            //activate Keycontrol
            self.keycontrolPossible(true);

            //trigger image fetching
            if(!self.videoStreamActive()) {
                setTimeout(function() {self._getImage('BED');}, 8000);
            }
        };

        self.saveBedCameraPosition = function() {
            //save values
            self.settings.plugins.OctoPNP.camera.bed.x(parseFloat(self.settings.plugins.OctoPNP.camera.bed.x())+self.offsetCorrectionX());
            self.settings.plugins.OctoPNP.camera.bed.y(parseFloat(self.settings.plugins.OctoPNP.camera.bed.y())+self.offsetCorrectionY());

            //deactivate Keycontrol
            self.keycontrolPossible(false);
            self.statusBedCameraOffset(false);

            // stop potential live video preview
            self.stopVideo();
        };

        self.saveExtruderHeadCameraOffset = function() {
            // save offset
            self.saveExtruderOffset(self.selectedHeadExtruder());
            
            // deactivate Button
            self.statusHeadCameraOffset(false);

            // stop potential live video preview
            self.stopVideo();
        };
        
        
        self.saveExtruderBedCameraOffset = function() {
            // invert X and Y axis
            self.offsetCorrectionX(self.offsetCorrectionX()*-1);
            self.offsetCorrectionY(self.offsetCorrectionY()*-1);
            
            // save offset
            self.saveExtruderOffset(self.selectedBedExtruder());
            
            // deactivate Button
            self.statusBedCameraOffset(false);

            // stop potential live video preview
            self.stopVideo();
        };

        self.saveExtruderOffset = function(ex) {
            switch (self.detectedFirmware) {
                case self.supportedFirmWares.repetier:
                    // Steps to save values:
                    // get current Extuder EEPROM starting with E1
                    ex = parseInt(ex)+1;
                    ex = ex.toString();

                    // get current offset for extruder x from eeprom
                    var oldOffsetX = parseFloat(self._getEepromValue("Extr." + ex + " X-offset"));
                    var oldOffsetY = parseFloat(self._getEepromValue("Extr." + ex + " Y-offset"));
                    // get steps per mm for x and y axis
                    var stepsPerMMX = parseFloat(self._getEepromValue("X-axis steps per mm"));
                    var stepsPerMMY = parseFloat(self._getEepromValue("Y-axis steps per mm"));
                    // compute offset steps from offsetCorrection values
                    var offsetX = oldOffsetX + self.offsetCorrectionX() * stepsPerMMX;
                    var offsetY = oldOffsetY + self.offsetCorrectionY() * stepsPerMMY;
                    // save to eeprom
                    self._setEepromValue("Extr." + ex + " X-offset", offsetX);
                    self._setEepromValue("Extr." + ex + " Y-offset", offsetY);
                    //console.log(offsetX);
                    //console.log(offsetY);
                    self.saveEeprom();
                    break;
                case self.supportedFirmWares.reprapfirmware:
                    var offsetX = self.extruderOffsetX() + self.offsetCorrectionX();
                    var offsetY = self.extruderOffsetY() + self.offsetCorrectionY();
                    self.control.sendCustomCommand({command: "G10 P" + ex.toString() + " X" + offsetX.toString() + " Y" + offsetY.toString()});
                    // warning: untested! this command maybe requires an explicit Z-value!
                    break;
                default:
                    return false;
            }

            //reset offset correction values
            self.offsetCorrectionX(0.0);
            self.offsetCorrectionY(0.0);
            self.extruderOffsetX(0.0);
            self.extruderOffsetY(0.0);

            // deactivate Keycontrol
            self.keycontrolPossible(false);

            // stop potential live video preview
            self.stopVideo();
        };
        
        
        // This should only be used if the PnP nozzle offset it not handled by the printer firmware
        // Move Vacuum bed camera to Nozzle.
        self.pnpNozzleOffset = function() {
            //deactivate other processes
            self.statusHeadCameraOffset(false);
            self.statusTrayPosition(false);
            self.statusBedCameraOffset(false);
            // delete if pnp offset in eeprom
            self.statusPnpNozzleOffset(true);

            // should we start live preview?
            self.stopVideo();
            if(self.settings.plugins.OctoPNP.camera.bed.http_path().length > 0) {
                self.startVideo(self.settings.plugins.OctoPNP.camera.bed.http_path());
            }

            // Move before toolchange
            //reset axis
            self.control.sendCustomCommand({command: "G1 X100 Y150 F3000"});
            // Switch to VacNozzle extruder
            self.control.sendCustomCommand({command: "T" + self.settings.plugins.OctoPNP.vacnozzle.extruder_nr().toString()});
            
            //move camera to object
            var x = parseFloat(self.settings.plugins.OctoPNP.camera.bed.x()) - parseFloat(self.settings.plugins.OctoPNP.vacnozzle.x());
            var y = parseFloat(self.settings.plugins.OctoPNP.camera.bed.y()) - parseFloat(self.settings.plugins.OctoPNP.vacnozzle.y());
            self.control.sendCustomCommand({command: "G1 X" + x + " Y" + y + " Z" + self.settings.plugins.OctoPNP.camera.bed.z() + " F3000"});
            
            //reset offset correction values
            self.offsetCorrectionX(0.0);
            self.offsetCorrectionY(0.0);

            //activate Keycontrol
            self.keycontrolPossible(true);

            //trigger immage fetching
            if(!self.videoStreamActive()) {
                setTimeout(function() {self._getImage('BED');}, 8000);
            }
        };
        
        // delete if pnp offset in eeprom
        self.savePnpNozzleOffset = function() {
            //save values
            self.settings.plugins.OctoPNP.vacnozzle.x(parseFloat(self.settings.plugins.OctoPNP.vacnozzle.x())-self.offsetCorrectionX());
            self.settings.plugins.OctoPNP.vacnozzle.y(parseFloat(self.settings.plugins.OctoPNP.vacnozzle.y())-self.offsetCorrectionY());

            //deactivate Keycontrol
            self.keycontrolPossible(false);
            self.statusPnpNozzleOffset(false);

            // stop potential live video preview
            self.stopVideo();
        };
        
        // calibrate tray position relative to primary extruder
        self.trayPosition = function(corner) {
            //deactivate other processes
            self.statusHeadCameraOffset(false);
            self.statusTrayPosition(true);
            self.statusBedCameraOffset(false);
            // delete if pnp offset in eeprom
            self.statusPnpNozzleOffset(false);

            // should we start live preview?
            self.stopVideo();
            if(self.settings.plugins.OctoPNP.camera.head.http_path().length > 0) {
                self.startVideo(self.settings.plugins.OctoPNP.camera.head.http_path());
            }

            // Switch to primary extruder
            self.control.sendCustomCommand({command: "G1 X100 Y150 F3000"});
            self.control.sendCustomCommand({command: "T0"});

            //compute corner position
            var cornerOffsetX = 0.0;
            var cornerOffsetY = 0.0;
            switch (corner) {
                case "TL": 
                    var rows = parseFloat(self.settings.plugins.OctoPNP.tray.rows());
                    cornerOffsetY = rows*parseFloat(self.settings.plugins.OctoPNP.tray.boxsize()) + (rows+1)*parseFloat(self.settings.plugins.OctoPNP.tray.rimsize());
                    self.statusTrayPosition(false);
                    break;
                case "TR": 
                    var rows = parseFloat(self.settings.plugins.OctoPNP.tray.rows());
                    var cols = parseFloat(self.settings.plugins.OctoPNP.tray.columns());
                    cornerOffsetY = rows*parseFloat(self.settings.plugins.OctoPNP.tray.boxsize()) + (rows+1)*parseFloat(self.settings.plugins.OctoPNP.tray.rimsize());
                    cornerOffsetX = cols*parseFloat(self.settings.plugins.OctoPNP.tray.boxsize()) + (cols+1)*parseFloat(self.settings.plugins.OctoPNP.tray.rimsize());
                    self.statusTrayPosition(false);
                    break;
                case "BR": 
                    var cols = parseFloat(self.settings.plugins.OctoPNP.tray.columns());
                    cornerOffsetX = cols*parseFloat(self.settings.plugins.OctoPNP.tray.boxsize()) + (cols+1)*parseFloat(self.settings.plugins.OctoPNP.tray.rimsize());
                    self.statusTrayPosition(false);
                    break;
                default:
                    // BL is default case, the tray position is allways computed for this point. Saving the calibration
                    // is only possible for this case.
                    break;
            }

            //move camera to tray
            var x = parseFloat(self.settings.plugins.OctoPNP.tray.x()) + cornerOffsetX - parseFloat(self.settings.plugins.OctoPNP.camera.head.x());
            var y = parseFloat(self.settings.plugins.OctoPNP.tray.y()) + cornerOffsetY - parseFloat(self.settings.plugins.OctoPNP.camera.head.y());
            var z = parseFloat(self.settings.plugins.OctoPNP.tray.z()) + parseFloat(self.settings.plugins.OctoPNP.camera.head.z());
            self.control.sendCustomCommand({command: "G1 X" + x + " Y" + y + " Z" + z + " F3000"});

            //reset offset correction values
            self.offsetCorrectionX(0.0);
            self.offsetCorrectionY(0.0);

            //activate Keycontrol
            self.keycontrolPossible(true);

            //trigger immage fetching
            if(!self.videoStreamActive()) {
                setTimeout(function() {self._getImage('HEAD');}, 8000);
            }
        };

        self.saveTrayPosition = function() {
            //save values
            self.settings.plugins.OctoPNP.tray.x(parseFloat(self.settings.plugins.OctoPNP.tray.x())+self.offsetCorrectionX());
            self.settings.plugins.OctoPNP.tray.y(parseFloat(self.settings.plugins.OctoPNP.tray.y())+self.offsetCorrectionY());

            //deactivate Keycontrol
            self.keycontrolPossible(false);
            self.statusTrayPosition(false);

            // stop potential live video preview
            self.stopVideo();
        };


        self._getImage = function(imagetype, callback) {
            $.ajax({
                url: PLUGIN_BASEURL + "OctoPNP/camera_image?imagetype=" + imagetype,
                type: "GET",
                dataType: "json",
                contentType: "application/json; charset=UTF-8",
                //data: JSON.stringify(data),
                success: function(response) {
                    if(response.hasOwnProperty("src")) {
                        self._drawImage(response.src);
                    }
                    if(response.hasOwnProperty("error")) {
                        alert(response.error);
                    }
                    if (callback) callback();
                }
            });
        };

        self._drawImage = function(img, break_cache = false) {
            var ctx=self._headCanvas.getContext("2d");  
            var localimg = new Image();
            localimg.onload = function () {
                var w = localimg.width;
                var h = localimg.height;
                var scale = Math.min(ctx.canvas.clientWidth/w, ctx.canvas.clientHeight/h,1);
                ctx.drawImage(localimg, 0, 0, w*scale, h*scale);

                // crosshairs
                ctx.beginPath();
                ctx.strokeStyle = "#000000";
                ctx.lineWidth = 1;
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, ((h*scale)/2)-0.5, w*scale, 1);
                ctx.fillRect(((w*scale)/2)-0.5, 0, 1, h*scale);
            };
            if(break_cache) {
                img = img + "?" + new Date().getTime();
            }
            localimg.src = img;
        };

        self.onFocus = function (data, event) {
            if (!self.keycontrolPossible()) return;
            self.keycontrolActive(true);
        };

        self.onMouseOver = function (data, event) {
            if (!self.keycontrolPossible()) return;
            $("#webcam_container").focus();
            self.keycontrolActive(true);
        };

        self.onMouseOut = function (data, event) {
            $("#webcam_container").blur();
            self.keycontrolActive(false);
        };

        self.toggleKeycontrolHelp = function () {
            self.keycontrolHelpActive(!self.keycontrolHelpActive());
        };

        self.onKeyDown = function (data, event) {
            var refreshImage = false;

            switch (event.which) {
                case 37: // left arrow key
                    // X-
                    self.control.sendJogCommand("x", -1, self.jogDistance());
                    self.offsetCorrectionX(parseFloat((self.offsetCorrectionX()-self.jogDistance()).toFixed(2)));
                    refreshImage = true;
                    break;
                case 38: // up arrow key
                    // Y+
                    self.control.sendJogCommand("y", 1, self.jogDistance());
                    self.offsetCorrectionY(parseFloat((self.offsetCorrectionY()+self.jogDistance()).toFixed(2)));
                    refreshImage = true;
                    break;
                case 39: // right arrow key
                    // X+
                    self.control.sendJogCommand("x", 1, self.jogDistance());
                    self.offsetCorrectionX(parseFloat((self.offsetCorrectionX()+self.jogDistance()).toFixed(2)));
                    refreshImage = true;
                    break;
                case 40: // down arrow key
                    // Y-
                    self.control.sendJogCommand("y", -1, self.jogDistance());
                    self.offsetCorrectionY(parseFloat((self.offsetCorrectionY()-self.jogDistance()).toFixed(2)));
                    refreshImage = true;
                    break;
                case 49: // number 1
                case 97: // numpad 1
                    // Distance 0.1
                    self.jogDistance(0.1);
                    break;
                case 50: // number 2
                case 98: // numpad 2
                    // Distance 1
                    self.jogDistance(1.0);
                    break;
                case 51: // number 3
                case 99: // numpad 3
                    // Distance 10
                    self.jogDistance(10.0);
                    break;
                case 52: // number 4
                case 100: // numpad 4
                    // Distance 100
                    self.jogDistance(100.0);
                    break;
                case 33: // page up key
                case 87: // w key
                    // z lift up
                    break;
                case 34: // page down key
                case 83: // s key
                    // z lift down
                    break;
                case 36: // home key
                    // xy home
                    break;
                case 35: // end key
                    // z home
                    break;
                default:
                    event.preventDefault();
                    return false;
            }
            if(refreshImage && !self.videoStreamActive()) {
                if(self.statusBedCameraOffset() || self.statusPnpNozzleOffset()) {
                    setTimeout(function() {self._getImage('BED');}, 300);
                }else{
                    setTimeout(function() {self._getImage('HEAD');}, 300);
                }
            }
        };


        // The following functions provide "infrastructure" to detect the printer's firmware type and to access and modify eeprom values
        self.onStartup = function() {
            $('#settings_plugin_OctoPNP_link a').on('show', function(e) {
                if(!self.isConnected())
                    self.detectedFirmwareInfo("<span style=\"color: red\">Printer not connected! Calibration requires a connection!</span>");

                if (self.isConnected() && self.detectedFirmware == self.supportedFirmWares.unknown) {
                    self.isSupportedFirmware(false);
                    self._requestFirmwareInfo();
                }
            });
        }

        self.onEventConnected = function() {
            self._requestFirmwareInfo();
        }

        self.onEventDisconnected = function() {
            self.detectedFirmware = self.supportedFirmWares.unknown;
            self.isSupportedFirmware(false);
            self.detectedFirmwareInfo("<span style=\"color: red\">Printer not connected! Calibration requires a connection!</span>");
        };

        self._requestFirmwareInfo = function() {
            // update UI to unknown firmware information
            self.detectedFirmware = self.supportedFirmWares.unknown;
            self.isSupportedFirmware(false);
            self.detectedFirmwareInfo("<span style=\"color: red\">Firmware type not detected</span>");

            // request firmware info from printer
            self.control.sendCustomCommand({ command: "M115" });
        };

        self.fromHistoryData = function(data) {
            _.each(data.logs, function(line) {
                var match = self.firmwareRegEx.exec(line);
                if (match != null) {
                    self._detectFirmwareInfo(line);
                }
            });
        };

        self.fromCurrentData = function(data) {
            switch (self.detectedFirmware) {
                case self.supportedFirmWares.unknown:
                    _.each(data.logs, function (line) {
                        var match = self.firmwareRegEx.exec(line);
                        if (match) {
                            self._detectFirmwareInfo(line);
                        }
                    });
                    break;
                case self.supportedFirmWares.repetier:
                    _.each(data.logs, function (line) {
                        var match = (new RegExp(/EPR:(\d+) (\d+) ([^\s]+) (.+)/)).exec(line);
                        if (match) {
                            self.eepromData.push({
                                dataType: match[1],
                                position: match[2],
                                origValue: match[3],
                                value: match[3],
                                description: match[4]
                            });
                        }
                    });
                    break;
                case self.supportedFirmWares.reprapfirmware:
                    _.each(data.logs, function (line) {
                        // THIS IST NOT THE CORRECT REGEXP! Not implemented yet!!!
                        var match = (new RegExp(/EPR:(\d+) (\d+) ([^\s]+) (.+)/)).exec(line);
                        if (match) {
                            //self.extruderOffsetX(value);
                            //self.extruderOffsetY(value);
                        }
                    });
                    break;
                default:
                    return false;
            }
        };

        self._detectFirmwareInfo = function(line) {
            var match;

            match = (new RegExp(/Virtual\sMarlin([^\s]*)/i)).exec(line);
            if (match) {
                self.detectedFirmwareInfo("<span style=\"color: orange\">Connected to Octoprints virtual printer! Use for testing only!</span>");
                self.detectedFirmware = self.supportedFirmWares.notsupported;
                self.isSupportedFirmware(false);
            }

            match = (new RegExp(/Repetier_([^\s]*)/i)).exec(line);
            if (match) {
                self.detectedFirmwareInfo("<span style=\"color: green\">Connected to Repetier Firmware</span>");
                self.detectedFirmware = self.supportedFirmWares.repetier;
                self.isSupportedFirmware(true);
            }

            match = (new RegExp(/RepRapFirmware([^\s]*)/i)).exec(line);
            if (match) {
                self.detectedFirmwareInfo("<span style=\"color: green\">Connected to RepRapFirmware</span>");
                self.detectedFirmware = self.supportedFirmWares.reprapfirmware;
                self.isSupportedFirmware(true);
            }
        };

        self.loadOffsets = function(extruder) {
            self.extruderOffsetX(0.0);
            self.extruderOffsetY(0.0);
            switch (self.detectedFirmware) {
                case self.supportedFirmWares.repetier:
                    self.eepromData([]);
                    self.control.sendCustomCommand({ command: "M205" });
                    break;
                case self.supportedFirmWares.reprapfirmware:
                    self.control.sendCustomCommand({command: "G10 P" + extruder.toString()});
                    break;
                default:
                    return false;
            }
        };

        self.saveEeprom = function()  {
            var eepromData = self.eepromData();
            _.each(eepromData, function(data) {
                if (data.origValue != data.value) {
                    self._requestSaveDataToEeprom(data.dataType, data.position, data.value);
                    data.origValue = data.value;
                }
            });
        };

        self._getEepromValue = function(description) {
            var eepromData = self.eepromData();
            var result = false;
            _.each(eepromData, function(data) {
                if ((new RegExp(description)).test(data.description)) {
                    result = data.value;
                }
            });
            return result;
        }

        self._setEepromValue = function(description, value) {
            var eepromData = self.eepromData();
            var result = false;
            _.each(eepromData, function(data) {
                if ((new RegExp(description)).test(data.description)) {
                    data.value = value;
                }
            });
        }

        self._requestSaveDataToEeprom = function(data_type, position, value) {
            var cmd = "M206 T" + data_type + " P" + position;
            if (data_type == 3) {
                cmd += " X" + value;
                self.control.sendCustomCommand({ command: cmd });
            }
            else {
                cmd += " S" + value;
                self.control.sendCustomCommand({ command: cmd });
            }
        }
    }


    // This is how our plugin registers itself with the application, by adding some configuration information to
    // the global variable ADDITIONAL_VIEWMODELS
    ADDITIONAL_VIEWMODELS.push([
        // This is the constructor to call for instantiating the plugin
        OctoPNPSettingsViewModel,

        // This is a list of dependencies to inject into the plugin, the order which you request here is the order
        // in which the dependencies will be injected into your view model upon instantiation via the parameters
        // argument
        ["settingsViewModel", "controlViewModel", "connectionViewModel"],

        // Finally, this is the list of all elements we want this view model to be bound to.
        "#settings_plugin_OctoPNP"
    ]);
});
