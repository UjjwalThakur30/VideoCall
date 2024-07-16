var WebRtcDemo = WebRtcDemo || {};

// todo:
//  cleanup: proper module loading
//  cleanup: promises to clear up some of the async chaining
//  feature: multiple chat partners

WebRtcDemo.App = (function (viewModel, connectionManager) {
    var _mediaStream,
        _hub,
        isVideoPaused = false,
        isAudioPaused = false,
        isScreenSharing = false,
        isStudentScreenSharing = false,
        _screenStream,

        _connect = function (username, type, onSuccess, onFailure) {
            // Set Up SignalR Signaler
            var hub = $.connection.webRtcHub;
            $.support.cors = true;
            $.connection.hub.url = '/signalr/hubs';
            $.connection.hub.start()
                .done(function () {
                    console.log('connected to SignalR hub... connection id: ' + _hub.connection.id);

                    // Tell the hub what our username is
                    hub.server.join(username, type);

                    if (onSuccess) {
                        onSuccess(hub);
                    }
                })
                .fail(function (event) {
                    if (onFailure) {
                        onFailure(event);
                    }
                });

            // Setup client SignalR operations
            _setupHubCallbacks(hub);
            _hub = hub;
        },

        _start = function (hub) {
            // Show warning if WebRTC support is not detected
            if (webrtcDetectedBrowser == null) {
                console.log('Your browser doesnt appear to support WebRTC.');
                $('.browser-warning').show();
            }

            // Then proceed to the next step, gathering username
            var uname = _getUsername();
            _initChat(uname)
        },

        _getUsername = function () {
            //alertify.prompt("What is your name?", function (e, username) {
            //    if (e == false || username == '') {
            //        username = 'User ' + Math.floor((Math.random() * 10000) + 1);
            //        alertify.success('You really need a username, so we will call you... ' + username);
            //    }

            //    // proceed to next step, get media access and start up our connection
            //}, '');
            var username = getUrlKeyword('username');
            var type = getUrlKeyword('type');
            if (!username) {

                username = 'User ' + Math.floor((Math.random() * 10000) + 1);
                alertify.success('You really need a username, so we will call you... ' + username);
            }
            else {
                alertify.success('Welcome, ' + username + '!');
            }
            if (type.toLowerCase() == "student") {
                $("#requestScreenShareButton").addClass("hide");
                $('.video.partner').closest('div.span6').addClass('hide');
            } else {
                $("#requestScreenShareButton").removeClass("hide");
            }

            // Notify the user about their assigned username
            _startSession(username, type);
            return username;
        },
        getUrlKeyword = function (name) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get(name);
        },
        _initChat = function (username) {
            _connectToChat(username);
        },
        _connectToChat = function (username) {

            //$.connection.hub.start().done(function () {
            //    console.log('Connected to chat SignalR hub.');

            //    // Join the chat with username
            //    _hub.server.join(username);
            //});

            // Add any other chat hub callbacks here
        }, toggleScreenShare = function () {
            if (!isScreenSharing) {
                startScreenShare();
            } else {
                stopScreenShare();
            }
        },

        startScreenShare = function () {
            toggleVideo();
            navigator.mediaDevices.getDisplayMedia({ video: true }).then(function (stream) {
                _screenStream = stream;
                isScreenSharing = true;

                var videoElement = document.querySelector('.video.mine');
                videoElement.srcObject = _screenStream;

                var oldTrack = _mediaStream.getVideoTracks()[0];
                var newTrack = _screenStream.getVideoTracks()[0];
                // Send the screen stream to the specified connection
                connectionManager.replaceTrack(oldTrack, newTrack);

                _screenStream.getVideoTracks()[0].addEventListener('ended', function () {
                    stopScreenShare();
                });

                document.getElementById('requestScreenShareButton').innerText = isScreenSharing ? 'Stop Sharing' : 'Share Screen';
            }).catch(function (error) {
                console.error("Error sharing screen.", error);
            });
        },

        stopScreenShare = function () {
            if (_screenStream) {
                _screenStream.getTracks().forEach(track => track.stop());
            }
            isScreenSharing = false;

            var videoElement = document.querySelector('.video.mine');
            videoElement.srcObject = _mediaStream;
            var oldTrack = _mediaStream.getVideoTracks()[0];
            var newTrack = _screenStream.getVideoTracks()[0];
            // Restore the original video track
            connectionManager.replaceTrack(_screenStream.getVideoTracks()[0], _mediaStream.getVideoTracks()[0]);
            document.getElementById('requestScreenShareButton').innerText = isScreenSharing ? 'Stop Sharing' : 'Share Screen';
            hangup();
            toggleVideo();
        },

        _startSession = function (username, type) {
            viewModel.Username(username); // Set the selected username in the UI
            viewModel.Loading(true); // Turn on the loading indicator

            // Ask the user for permissions to access the webcam and mic
            getUserMedia(
                {
                    // Permissions to request
                    video: true,
                    audio: false
                },
                function (stream) { // succcess callback gives us a media stream
                    $('.instructions').hide();

                    // Now we have everything we need for interaction, so fire up SignalR
                    _connect(username, type, function (hub) {
                        // tell the viewmodel our conn id, so we can be treated like the special person we are.
                        viewModel.MyConnectionId(hub.connection.id);

                        // Initialize our client signal manager, giving it a signaler (the SignalR hub) and some callbacks
                        console.log('initializing connection manager');
                        connectionManager.initialize(hub.server, _callbacks.onReadyForStream, _callbacks.onStreamAdded, _callbacks.onStreamRemoved);

                        // Store off the stream reference so we can share it later
                        _mediaStream = stream;

                        // Load the stream into a video element so it starts playing in the UI
                        console.log('playing my local video feed');
                        var videoElement = document.querySelector('.video.mine');
                        attachMediaStream(videoElement, _mediaStream);

                        // Hook up the UI
                        _attachUiHandlers();

                        viewModel.Loading(false);
                    }, function (event) {
                        alertify.alert('<h4>Failed SignalR Connection</h4> We were not able to connect you to the signaling server.<br/><br/>Error: ' + JSON.stringify(event));
                        viewModel.Loading(false);
                    });
                },
                function (error) { // error callback
                    alertify.alert('<h4>Failed to get hardware access!</h4> Do you have another browser type open and using your cam/mic?<br/><br/>You were not connected to the server, because I didn\'t code to make browsers without media access work well. <br/><br/>Actual Error: ' + JSON.stringify(error));
                    viewModel.Loading(false);
                }
            );
        },

        _attachUiHandlers = function () {
            // Add click handler to users in the "Users" pane
            $(document).on('click', '.user', function () {
                // Find the target user's SignalR client id
                if ($(event.target).hasClass('notifyUserButton') || $(event.target).is('#toggleVideoButton')) {
                    return;
                }
                var targetConnectionId = $(this).attr('data-cid');


                // Make sure we are in a state where we can make a call
                if (viewModel.Mode() !== 'idle') {
                    alertify.error('Sorry, you are already in a call.  Conferencing is not yet implemented.');
                    return;
                }

                // Then make sure we aren't calling ourselves.
                if (targetConnectionId != viewModel.MyConnectionId()) {
                    // Initiate a call

                    startCall(targetConnectionId);
                    _hub.server.callUser(targetConnectionId);

                    // UI in calling mode
                    viewModel.Mode('calling');
                } else {
                    alertify.error("Ah, nope.  Can't call yourself.");
                }
            });
            $(document).on('click', '.notifyUserButton', function () {
                event.stopPropagation();
                var connectionId = $(this).closest('.user').attr('data-cid');
                if (connectionId) {
                    toggleVideo();
                    var message = 'Can you share your screen?';
                    _hub.server.sendNotification(connectionId, message)
                        .done(function () {
                            alertify.success('Notification sent to user with connection ID: ' + connectionId);
                        })
                        .fail(function (error) {
                            alertify.error('Failed to send notification: ' + JSON.stringify(error));
                        });
                    var x = $(this).text(isStudentScreenSharing ? 'Request Screen Share' : 'Stop Sharing');
                    var newtext = x.text();
                    changeButtonText(connectionId, newtext)
                    if (viewModel.Mode() !== 'idle') {
                        alertify.error('Sorry, you are already in a call.  Conferencing is not yet implemented.');
                        return;
                    }

                    // Then make sure we aren't calling ourselves.
                    if (connectionId != viewModel.MyConnectionId()) {
                        // Initiate a call

                        startCall(connectionId);
                        startCallTesting(connectionId);
                        _hub.server.callUser(connectionId);
                        $("#TestingVideo").removeClass("hide");

                        // UI in calling mode
                        viewModel.Mode('calling');
                    } else {
                        alertify.error("Ah, nope.  Can't call yourself.");
                    }

                } else {
                    alertify.error('No connection ID found.');
                }
            });
            $(document).on('click', '#toggleVideoButton', function (event) {
                event.stopPropagation();
                var targetConnectionId = $(this).closest('.user').attr('data-cid');

                // Make sure we are in a state where we can make a call
                if (viewModel.Mode() !== 'idle') {
                    alertify.error('Sorry, you are already in a call.  Conferencing is not yet implemented.');
                    return;
                }

                // Then make sure we aren't calling ourselves.
                if (targetConnectionId != viewModel.MyConnectionId()) {
                    // Initiate a call

                    startCall(targetConnectionId);
                    _hub.server.callUser(targetConnectionId);

                    // UI in calling mode
                    viewModel.Mode('calling');
                } else {
                    alertify.error("Ah, nope.  Can't call yourself.");
                }
                toggleVideo();
                toggleaudio();
            });
            $('#sendmessage').click(function () {
                var message = $('#message').val();
                var listItem = $('.icon-user').closest('li');
                // Find the div with class "username"
                var username = listItem.find('.username').text().trim();
                _hub.server.send(username, message);
                $('#message').val('').focus();
            });

            // Add handler for the hangup button
            $('.hangup').click(function () {
                // Only allow hangup if we are not idle
                if (viewModel.Mode() != 'idle') {
                    _hub.server.hangUp();
                    connectionManager.closeAllConnections();
                    viewModel.Mode('idle');
                }
            });
            $(document).on('click', '#requestScreenShareButton', function (event) {
                toggleScreenShare();
            });

            //document.getElementById('toggleVideoButton').addEventListener('click', toggleVideo);
        },
         hangup = function () {
            // Only allow hangup if we are not idle
            if (viewModel.Mode() != 'idle') {
                _hub.server.hangUp();
                connectionManager.closeAllConnections();
                viewModel.Mode('idle');
            }
        },
        changeButtonText = function (connectionId, newText) {
            var userElement = document.querySelector(`li.user[data-cid="${connectionId}"]`);
            // If the user element is found
            if (userElement) {
                // Find the notifyUserButton within that user element
                var notifyButton = userElement.querySelector('.notifyUserButton');

                // If the notifyButton is found
                if (notifyButton) {
                    // Change the text of the notifyUserButton
                    notifyButton.textContent = newText;
                    if (newText.toLowerCase() == "Stop Sharing") {
                        isStudentScreenSharing = true;
                    }
                } else {
                    console.error('notifyUserButton not found');
                }
            } else {
                console.error('User with ConnectionId', connectionId, 'not found');
            }
        },
        toggleVideo = function () {
            if (_mediaStream) {
                var videoTracks = _mediaStream.getVideoTracks();
                if (videoTracks.length > 0) {
                    videoTracks[0].enabled = !videoTracks[0].enabled;
                    isVideoPaused = !videoTracks[0].enabled;
                    document.getElementById('toggleVideoButton').innerText = isVideoPaused ? 'Resume Video' : 'Pause Video';
                } else {
                    console.error("No video tracks found in the media stream.");
                }

                var audioTracks = _mediaStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    audioTracks[0].enabled = !audioTracks[0].enabled;
                    isAudioPaused = !audioTracks[0].enabled;
                } else {
                    console.error("No audio tracks found in the media stream.");
                }
            } else {
                console.error("_mediaStream is not initialized.");
            }
        },toggleaudio = function () {
            if (_mediaStream) {
                var audioTracks = _mediaStream.getAudioTracks();
                if (audioTracks.length > 0) {
                    audioTracks[0].enabled = false;
                    isAudioPaused = !audioTracks[0].enabled;
                } else {
                    console.error("No audio tracks found in the media stream.");
                }
            } else {
                console.error("_mediaStream is not initialized.");
            }
        },
        startCall = function (targetConnectionId) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(function (stream) {
                    _mediaStream = stream;
                    // Set the stream to the video element, if any
                    var videoElement = document.querySelector('.video.mine');
                    if (videoElement) {
                        videoElement.srcObject = stream;
                    }

                    // Signal the other peer to start the call
                    //_hub.server.callUser(targetConnectionId);
                })
                .catch(function (error) {
                    console.error("Error accessing media devices.", error);
                    toggleVideo();
                    _mediaStream = "";
                });
        },
        startCallTesting = function (targetConnectionId) {
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(function (stream) {
                    _mediaStream = stream;
                    // Set the stream to the video element, if any
                    var videoElement = document.getElementById('TestingVideo');
                    if (videoElement) {
                        videoElement.srcObject = stream;
                    }

                    // Signal the other peer to start the call
                    //_hub.server.callUser(targetConnectionId);
                })
                .catch(function (error) {
                    console.error("Error accessing media devices.", error);
                    toggleVideo();
                    _mediaStream = "";
                });
        };
        
        _setupHubCallbacks = function (hub) {
            // Hub Callback: Incoming Call
            hub.client.receiveNotification = function (message, callingUser) {
                        $('#requestScreenShareButton').click();
                //alertify.confirm(callingUser.Username + ' Is asking: ' + message, function (e) {
                //    if (e) {
                //    } else {

                //    }
                //});
            };
            hub.client.incomingCall = function (callingUser) {
                console.log('incoming call from: ' + JSON.stringify(callingUser));

                // Ask if we want to talk
                //alertify.confirm(callingUser.Username + ' is calling.  Do you want to chat?', function (e) {
                //    if (e) {
                //        // I want to chat
                //        hub.server.answerCall(true, callingUser.ConnectionId);

                //        // So lets go into call mode on the UI
                //        viewModel.Mode('incall');
                //    } else {
                //        // Go away, I don't want to chat with you
                //        hub.server.answerCall(false, callingUser.ConnectionId);
                //    }
                //});
                hub.server.answerCall(true, callingUser.ConnectionId);

                //        // So lets go into call mode on the UI
                        viewModel.Mode('incall');
            };

            // Hub Callback: Call Accepted
            hub.client.callAccepted = function (acceptingUser) {
                console.log('call accepted from: ' + JSON.stringify(acceptingUser) + '.  Initiating WebRTC call and offering my stream up...');

                // Callee accepted our call, let's send them an offer with our video stream
                connectionManager.initiateOffer(acceptingUser.ConnectionId, _mediaStream);
                
                // Set UI into call mode
                viewModel.Mode('incall');
            };

            // Hub Callback: Call Declined
            hub.client.callDeclined = function (decliningConnectionId, reason) {
                console.log('call declined from: ' + decliningConnectionId);

                // Let the user know that the callee declined to talk
                alertify.error(reason);

                // Back to an idle UI
                viewModel.Mode('idle');
            };

            // Hub Callback: Call Ended
            hub.client.callEnded = function (connectionId, reason) {
                console.log('call with ' + connectionId + ' has ended: ' + reason);

                // Let the user know why the server says the call is over
                alertify.error(reason);

                // Close the WebRTC connection
                connectionManager.closeConnection(connectionId);

                // Set the UI back into idle mode
                viewModel.Mode('idle');
            };

            // Hub Callback: Update User List
            hub.client.updateUserList = function (userList) {
                viewModel.setUsers(userList);
            };

            // Hub Callback: WebRTC Signal Received
            hub.client.receiveSignal = function (callingUser, data) {
                connectionManager.newSignal(callingUser.ConnectionId, data);
            };
            hub.client.addNewMessageToPage = function (name, message) {
                // This assumes you have an element with id 'discussion' to append messages to
                $('#discussion').append('<ul style="list-style-type:square"><li><strong style="color:red;font-style:normal;font-size:medium;text-transform:uppercase">' + htmlEncode(name) + '  ' + '<strong style="color:black;font-style:normal;font-size:medium;text-transform:lowercase">said</strong>' + '</strong>: ' + '<strong style="color:blue;font-style:oblique;font-size:medium">' + htmlEncode(message) + '</strong>' + '</li></ul>');
            };
        },

        // Connection Manager Callbacks
        _callbacks = {
            onReadyForStream: function (connection) {
                // The connection manager needs our stream
                // todo: not sure I like this
                connection.addStream(_mediaStream);
            },
            onStreamAdded: function (connection, event) {
                console.log('binding remote stream to the partner window');

                // Bind the remote stream to the partner window
                var otherVideo = document.querySelector('.video.partner');
                attachMediaStream(otherVideo, event.stream); // from adapter.js
            },
            onStreamRemoved: function (connection, streamId) {
                // todo: proper stream removal.  right now we are only set up for one-on-one which is why this works.
                console.log('removing remote stream from partner window');
                
                // Clear out the partner window
                var otherVideo = document.querySelector('.video.partner');
                otherVideo.src = '';
            }
        };

    return {
        start: _start, // Starts the UI process
        getStream: function() { // Temp hack for the connection manager to reach back in here for a stream
            return _mediaStream;
        }
    };
})(WebRtcDemo.ViewModel, WebRtcDemo.ConnectionManager);

// Kick off the app
WebRtcDemo.App.start();