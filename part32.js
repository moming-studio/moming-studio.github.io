var createOfferBtn = document.querySelector('#createOffer'),
    offerdiv = document.querySelector('#offer'),

    remoteofferInput = document.querySelector('#remoteoffer'),
    createAnserBtn = document.querySelector('#createAnser'),
    anserdiv = document.querySelector('#anser'),

    remoteanserInput = document.querySelector('#remoteanser'),
    setAnserBtn = document.querySelector('#setAnser'),

    officediv = document.querySelector('#office'),
    remoteansiceInput = document.querySelector('#remoteansice'),
    setofficeBtn = document.querySelector('#setoffice');

    ansicediv = document.querySelector('#ansice'),
    remoteofficeInput = document.querySelector('#remoteoffice'),
    setansiceBtn = document.querySelector('#setansice');

var mineVideo = document.querySelector('#mine1'),
    their1Video = document.querySelector('#their1'),
    their2Video = document.querySelector('#their2'),
    their3Video = document.querySelector('#their3');

var offerConnection,anserConnection, connectedUser, stream1,stream2,stream3, dataChannel;
var officeList = [];
var ansericeList = [];

function startConnection() {
  if (hasUserMedia()) {
    //获取第一路流
    navigator.getUserMedia({ audio: false,video: { 'mandatory': { 'minWidth': 1080, 'maxWidth': 1080,
                'minHeight': 720, 'maxHeight': 720 } }}, function (mystream1) {
      stream1 = mystream1;

      //获取第二路流
      navigator.getUserMedia({ audio: false,video: { 'mandatory': { 'minWidth': 640, 'maxWidth': 640,
                  'minHeight': 480, 'maxHeight': 480 } }}, function (mystream2) {
          stream2 = mystream2;
          //获取第三路流
          navigator.getUserMedia({ audio: false,video: { 'mandatory': { 'minWidth': 320, 'maxWidth': 320,
                      'minHeight': 240, 'maxHeight': 240 } }}, function (mystream3) {
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
  offerConnection = new RTCPeerConnection(configuration, {optional: [{RtpDataChannels: true}]});

  // Setup stream listening
    offerConnection.addStream(stream1);
    offerConnection.addStream(stream2);
    offerConnection.addStream(stream3);

    anserConnection = new RTCPeerConnection(configuration, {optional: [{RtpDataChannels: true}]});
    anserConnection.onaddstream = function (e) {
        if(their1Video.src == "") {
            their1Video.src = window.URL.createObjectURL(e.stream);
        }else if(their2Video.src == "") {
            their2Video.src = window.URL.createObjectURL(e.stream);
        }else if(their3Video.src == "") {
            their3Video.src = window.URL.createObjectURL(e.stream);
        }
  };

  // Setup ice handling
  offerConnection.onicecandidate = function (event) {
    if (event.candidate) {
        officeList.push(event.candidate);
        officediv.innerHTML = JSON.stringify(officeList);
        //remoteofficeInput.value = JSON.stringify(officeList);
    }
  };

    anserConnection.onicecandidate = function (event) {
      if (event.candidate) {
          ansericeList.push(event.candidate);
          ansicediv.innerHTML = JSON.stringify(ansericeList);
          //remoteansiceInput.value = JSON.stringify(ansericeList);
      }
  };
}

startConnection();

createOfferBtn.addEventListener("click", function (event) {
    offerConnection.createOffer(function (offer) {
        offerdiv.innerHTML = JSON.stringify(offer);

        //remoteofferInput.value =  JSON.stringify(offer);
        offerConnection.setLocalDescription(offer);
    }, function (error) {
        alert("An error has occurred.");
    });
});

createAnserBtn.addEventListener("click", function (event) {
    if(remoteofferInput.value.length<=0)
      return;
    var offer = JSON.parse(remoteofferInput.value);

    anserConnection.setRemoteDescription(new RTCSessionDescription(offer));
    anserConnection.createAnswer(function (answer) {
        anserConnection.setLocalDescription(answer);
        anserdiv.innerHTML =JSON.stringify(answer);
        //remoteanserInput.value = JSON.stringify(answer);
    }, function (error) {
        alert("An error has occurred");
    });
});

setAnserBtn.addEventListener("click", function (event) {
    if(remoteanserInput.value.length<=0)
        return;
    var anser = JSON.parse(remoteanserInput.value);
    offerConnection.setRemoteDescription(new RTCSessionDescription(anser));
});

setofficeBtn.addEventListener("click", function (event) {
    if(remoteansiceInput.value.length<=0)
        return;
    var ice_list = JSON.parse(remoteansiceInput.value);
    for(var item in ice_list) {
        offerConnection.addIceCandidate(new RTCIceCandidate(ice_list[item]));
    }
});

setansiceBtn.addEventListener("click", function (event) {
    if(remoteofferInput.value.length<=0)
        return;
    var ice_list = JSON.parse(remoteofficeInput.value);
    for(var item in ice_list) {
        anserConnection.addIceCandidate(new RTCIceCandidate(ice_list[item]));
    }
});

function hasUserMedia() {
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  return !!navigator.getUserMedia;
}

function hasRTCPeerConnection() {
  window.RTCPeerConnection = window.webkitRTCPeerConnection || window.RTCPeerConnection || window.mozRTCPeerConnection;
  window.RTCSessionDescription = window.webkitRTCSessionDescription || window.RTCSessionDescription || window.mozRTCSessionDescription;
  window.RTCIceCandidate = window.webkitRTCIceCandidate ||window.RTCIceCandidate || window.mozRTCIceCandidate;
  return !!window.RTCPeerConnection;
}

function onLeave() {
  connectedUser = null;
  their1Video.src = null;
  yourConnection.close();
  yourConnection.onicecandidate = null;
  yourConnection.onaddstream = null;
  setupPeerConnection(stream);
};
