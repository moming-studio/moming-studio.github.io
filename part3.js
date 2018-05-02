var name,
    connectedUser;

var connection = new WebSocket('ws://192.168.31.147:8887');

connection.onopen = function () {
  console.log("Connected");
};

// Handle all messages through this callback
connection.onmessage = function (message) {
  console.log("Got message", message.data);

  var data = JSON.parse(message.data);

  switch(data.type) {
    case "login":
      onLogin(data.success);
      break;
    case "offer":
      onOffer(data.offer, data.name);
      break;
    case "answer":
      onAnswer(data.answer);
      break;
    case "candidate":
      onCandidate(data.candidate);
      break;
    case "leave":
      onLeave();
      break;
    default:
      break;
  }
};

connection.onerror = function (err) {
  console.log("Got error", err);
};

// Alias for sending messages in JSON format
function send(message) {
  if (connectedUser) {
    message.name = connectedUser;
  }

  connection.send(JSON.stringify(message));
};

var loginPage = document.querySelector('#login-page'),
    usernameInput = document.querySelector('#username'),
    loginButton = document.querySelector('#login'),
    callPage = document.querySelector('#call-page'),
    theirUsernameInput = document.querySelector('#their-username'),
    callButton = document.querySelector('#call'),
    hangUpButton = document.querySelector('#hang-up'),
    messageInput = document.querySelector('#message'),
    sendButton = document.querySelector('#send'),
    received = document.querySelector('#received');

callPage.style.display = "none";

// Login when the user clicks the button
loginButton.addEventListener("click", function (event) {
  name = usernameInput.value;

  if (name.length > 0) {
    send({
      type: "login",
      name: name
    });
  }
});

function onLogin(success) {
  if (success === false) {
    alert("Login unsuccessful, please try a different name.");
  } else {
    loginPage.style.display = "none";
    callPage.style.display = "block";

    // Get the plumbing ready for a call
    startConnection();
  }
};

var mineVideo = document.querySelector('#mine1'),
    their1Video = document.querySelector('#their1'),
    their2Video = document.querySelector('#their2'),
    their3Video = document.querySelector('#their3');

var yourConnection, connectedUser, stream1,stream2,stream3, dataChannel;

function startConnection() {
  if (hasUserMedia()) {
    //获取第一路流
    navigator.getUserMedia({video: {width: {exact: 1080}, height: {exact: 1080}}}, function (mystream1) {
      stream1 = mystream1;

      //获取第二路流
      navigator.getUserMedia({video: {width: {exact: 640}, height: {exact: 640}}}, function (mystream2) {
          stream2 = mystream2;
          //获取第三路流
          navigator.getUserMedia({video: {width: {exact: 320}, height: {exact: 320}}}, function (mystream3) {
              stream3 = mystream3;
              mineVideo.src = window.URL.createObjectURL(stream3);
              //开始连接
              if (hasRTCPeerConnection()) {
                  setupPeerConnection();
              } else {
                  alert("Sorry, your browser does not support WebRTC.");
              }
          }, function (error) {
              console.log(error);
          });
      }, function (error) {
          console.log(error);
      });
    }, function (error) {
        console.log(error);
    });
  } else {
    alert("Sorry, your browser does not support WebRTC.");
  }
}

function setupPeerConnection() {
  var configuration = {
    "iceServers": [{ "url": "stun:127.0.0.1:9876" }]
  };
  yourConnection = new RTCPeerConnection(configuration, {optional: [{RtpDataChannels: true}]});

  // Setup stream listening
  yourConnection.addStream(stream1);
  yourConnection.addStream(stream2);
  yourConnection.addStream(stream3);
  yourConnection.onaddstream = function (e) {
    if(their1Video.src == "") {
        their1Video.src = window.URL.createObjectURL(e.stream);
    }else if(their2Video.src == "") {
          their2Video.src = window.URL.createObjectURL(e.stream);
    }else if(their3Video.src == "") {
          their3Video.src = window.URL.createObjectURL(e.stream);
    }
  };

  // Setup ice handling
  yourConnection.onicecandidate = function (event) {
    if (event.candidate) {
      send({
        type: "candidate",
        candidate: event.candidate
      });
    }
  };

  openDataChannel();
}

function openDataChannel() {
  var dataChannelOptions = {
    reliable: true
  };
  dataChannel = yourConnection.createDataChannel("myLabel", dataChannelOptions);

  dataChannel.onerror = function (error) {
    console.log("Data Channel Error:", error);
  };

  dataChannel.onmessage = function (event) {
    console.log("Got Data Channel Message:", event.data);

    received.innerHTML += event.data + "<br />";
    received.scrollTop = received.scrollHeight;
  };

  dataChannel.onopen = function () {
    dataChannel.send(name + " has connected.");
  };

  dataChannel.onclose = function () {
    console.log("The Data Channel is Closed");
  };
}

// Bind our text input and received area
sendButton.addEventListener("click", function (event) {
  var val = messageInput.value;
  received.innerHTML += val + "<br />";
  received.scrollTop = received.scrollHeight;
  dataChannel.send(val);
});

function hasUserMedia() {
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  return !!navigator.getUserMedia;
}

function hasRTCPeerConnection() {
  window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  window.RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;
  window.RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate;
  return !!window.RTCPeerConnection;
}

callButton.addEventListener("click", function () {
  var theirUsername = theirUsernameInput.value;

  if (theirUsername.length > 0) {
    startPeerConnection(theirUsername);
  }
});

function startPeerConnection(user) {
  connectedUser = user;

  // Begin the offer
  yourConnection.createOffer(function (offer) {
    send({
      type: "offer",
      offer: offer
    });
    yourConnection.setLocalDescription(offer);
  }, function (error) {
    alert("An error has occurred.");
  });
};

function onOffer(offer, name) {
  connectedUser = name;
  yourConnection.setRemoteDescription(new RTCSessionDescription(offer));

  yourConnection.createAnswer(function (answer) {
    yourConnection.setLocalDescription(answer);

    send({
      type: "answer",
      answer: answer
    });
  }, function (error) {
    alert("An error has occurred");
  });
};

function onAnswer(answer) {
  yourConnection.setRemoteDescription(new RTCSessionDescription(answer));
};

function onCandidate(candidate) {
  yourConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

hangUpButton.addEventListener("click", function () {
  send({
    type: "leave"
  });

  onLeave();
});

function onLeave() {
  connectedUser = null;
  their1Video.src = null;
  yourConnection.close();
  yourConnection.onicecandidate = null;
  yourConnection.onaddstream = null;
  setupPeerConnection(stream);
};
