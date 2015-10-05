/*globals nop,SnapCloud,Context,VariableFrame,SpriteMorph,StageMorph*/
// WebSocket Manager

var WebSocketManager = function (stage) {
    this.stage = stage;
    this.uuid = null;
    this.websocket = null;
    this.messages = [];
    this.gameType = 'None';
    this.devMode = true;
    this._connectWebSocket();
};

WebSocketManager.prototype._connectWebSocket = function() {
    // Connect socket to the server
    var self = this,
        isReconnectAttempt = this.websocket !== null,
        address;

    address = 'ws://'+(window.location.origin
        .replace('http://',''));

    // Don't connect if the already connected
    if (isReconnectAttempt) {
        console.log('trying to reconnect ('+this.websocket.readyState+')');
        if (this.websocket.readyState === this.websocket.OPEN) {
            return;
        } else if (this.websocket.readyState === this.websocket.CONNECTING) {
            // Check if successful in 500 ms
            setTimeout(self._connectWebSocket.bind(self), 500);
            return;
        }
    }

    this.websocket = new WebSocket(address);
    // Set up message firing queue
    this.websocket.onopen = function() {
        console.log('Connection established');  // REMOVE this
        self._updateProjectNetworkState();

        while (self.messages.length) {
            self.websocket.send(self.messages.shift());
        }
    };

    // Set up message events
    // Where should I set this up now?
    this.websocket.onmessage = function(message) {
        var data = message.data.split(' '),
            type = data.shift(),
            role,
            content;

        if (type === 'uuid') {
            console.log('Setting uuid to '+data.join(' '));
            self.uuid = data.join(' ');
        } else {
            role = data.pop();
            content = JSON.parse(data.join(' ') || null);
            self.onMessageReceived(type, content, role);
        }
    };

    this.websocket.onclose = function() {
        console.log('Connection closed');  // REMOVE this
        setTimeout(self._connectWebSocket.bind(self), 500);
    };
};

WebSocketManager.prototype.sendMessage = function(message) {
    var state = this.websocket.readyState;
    if (state === this.websocket.OPEN) {
        this.websocket.send(message);
    } else {
        this.messages.push(message);
    }
};

WebSocketManager.prototype.setGameType = function(gameType) {
    this.gameType = gameType.name;
    this._updateProjectNetworkState();
};

WebSocketManager.prototype._updateProjectNetworkState = function() {
    this.sendMessage('gameType '+this.gameType);
    var cmd = this.devMode ? 'on' : 'off';
    console.log('dev mode is now ' + cmd);
    this.sendMessage('devMode ' + cmd + ' ' + (SnapCloud.username || ''));
    
};

// FIXME: Toggle dev mode
WebSocketManager.prototype.toggleNetwork = function() {
    this.devMode = !this.devMode;
    this._updateProjectNetworkState();
};

/**
 * Callback for receiving a websocket message.
 *
 * @param {String} message
 * @return {undefined}
 */
WebSocketManager.prototype.onMessageReceived = function (message, content, role) {
    var self = this,
        hats = [],
        procs = [];

    content = content || [];
    if (message !== '') {
        this.stage.lastMessage = message;
        this.stage.children.concat(this.stage).forEach(function (morph) {
            if (morph instanceof SpriteMorph || morph instanceof StageMorph) {
                hats = hats.concat(morph.allHatSocketBlocksFor(message, role));
            }
        });

        hats.forEach(function (block) {
            // Initialize the variable frame with the message content for 
            // receiveSocketMessage blocks
            if (block.selector === 'receiveSocketMessage') {
                // Create the network context
                var context = new Context();
                for (var i = content.length; i--;) {
                    context.variables.addVar(i, content[i]);
                }
                procs.push(self.stage.threads.startProcess(
                    block, 
                    self.stage.isThreadSafe, 
                    undefined,
                    undefined,
                    context));
            } else {
                procs.push(self.stage.threads.startProcess(block, self.stage.isThreadSafe));
            }
        });
    }
    return procs;
};

WebSocketManager.prototype.destroy = function () {
    if (this.websocket.readyState === this.websocket.OPEN) {
        this._destroy();
    } else {
        this.websocket.onopen = this._destroy.bind(this);
    }
};

WebSocketManager.prototype._destroy = function () {
    this.websocket.onclose = nop;
    this.websocket.close();
};
