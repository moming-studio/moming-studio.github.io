var localName;
var request = null;
var hangingGet = null;
var server="http://192.168.31.147:8888";
var my_id = -1,peer_id=-1;
var other_peers = {};
var message_counter = 0;

function trace(txt) {
    console.log(txt);
    received.innerHTML += txt + "<br />";
    received.scrollTop = received.scrollHeight;
}
//1. 连接服务器
function connect() {
    if (localName.length == 0) {
        alert("I need a name please.");
    } else {
        signIn();
    }
}

//2.登录
function signIn() {
    try {
        request = new XMLHttpRequest();
        request.onreadystatechange = signInCallback;
        request.open("GET", server + "/sign_in?" + localName, true);
        request.send();
    } catch (e) {
        trace("error: " + e.description);
    }
}

//3. 登录回调
function signInCallback() {
    try {
        if (request.readyState == 4) {
            if (request.status == 200) {
                var peers = request.responseText.split("\n");
                my_id = parseInt(peers[0].split(',')[1]);
                trace("My id: " + my_id);
                for (var i = 1; i < peers.length; ++i) {
                    if (peers[i].length > 0) {
                        trace("Peer " + i + ": " + peers[i]);
                        var parsed = peers[i].split(',');
                        other_peers[parseInt(parsed[1])] = parsed[0];
                    }
                }
                onLogin(true);
                startHangingGet();
                request = null;
            }
        }
    } catch (e) {
        trace("error: " + e.description);
        onLogin(false);
    }
}

//4. 获取消息
function startHangingGet() {
    try {
        hangingGet = new XMLHttpRequest();
        hangingGet.onreadystatechange = hangingGetCallback;
        hangingGet.ontimeout = onHangingGetTimeout;
        hangingGet.open("GET", server + "/wait?peer_id=" + my_id, true);
        hangingGet.send();
    } catch (e) {
        trace("error" + e.description);
    }
}

//5. 超时重新获取消息
function onHangingGetTimeout() {
    trace("hanging get timeout. issuing again.");
    hangingGet.abort();
    hangingGet = null;
    if (my_id != -1)
        window.setTimeout(startHangingGet, 0);
}

//6. 处理收到的消息
function hangingGetCallback() {
    try {
        if (hangingGet.readyState != 4)
            return;
        if (hangingGet.status != 200) {
            trace("server error: " + hangingGet.statusText);
            disconnect();
        } else {
            var peer_id = GetIntHeader(hangingGet, "Pragma");
            if (peer_id == my_id) {
                handleServerNotification(hangingGet.responseText);
            } else {
                handlePeerMessage(peer_id, hangingGet.responseText);
            }
        }

        if (hangingGet) {
            hangingGet.abort();
            hangingGet = null;
        }

        if (my_id != -1)
            window.setTimeout(startHangingGet, 0);
    } catch (e) {
        trace("Hanging get error: " + e.description);
    }
}

//7. 服务器通过消息，主要是用户列表
function handleServerNotification(data) {
    trace("Server notification: " + data);
    var parsed = data.split(',');
    if (parseInt(parsed[2]) != 0)
        other_peers[parseInt(parsed[1])] = parsed[0];
}

//8. 处理peer发过来的消息
function handlePeerMessage(peer_id, text) {
    ++message_counter;
    var str = "Message from '" + other_peers[peer_id] + "':"+text;
    trace(str);
    var data = JSON.parse(text);
    if(data.type){
        switch(data.type) {
            case "offer":
                onReceivedOffer(data, peer_id);
                break;
            case "answer":
                onReceivedAnswer(data);
                break;
            default:
                break;
        }
    }else if(data.candidate){
        onReceivedCandidate(data);
    }
}

function GetIntHeader(r, name) {
    var val = r.getResponseHeader(name);
    return val != null && val.length ? parseInt(val) : -1;
}

//9. 发送消息
function send(obj) {
    var data= JSON.stringify(obj);
    if (!data.length || peer_id == 0) {
        alert("No text supplied or invalid peer id");
    } else {
        if (my_id == -1) {
            alert("Not connected");
            return;
        }
        if (peer_id == my_id) {
            alert("Can't send a message to oneself :)");
            return;
        }
        var r = new XMLHttpRequest();
        r.open("POST", server + "/message?peer_id=" + my_id + "&to=" + peer_id,
            false);
        r.setRequestHeader("Content-Type", "text/plain");
        r.send(data);
        trace("send:"+data);
        r = null;
    }
}

//10. 断开连接
function disconnect() {
    if (request) {
        request.abort();
        request = null;
    }
    if (hangingGet) {
        hangingGet.abort();
        hangingGet = null;
    }
    if (my_id != -1) {
        request = new XMLHttpRequest();
        request.open("GET", server + "/sign_out?peer_id=" + my_id, false);
        request.send();
        request = null;
        my_id = -1;
    }
}
window.onbeforeunload = disconnect;

//---------界面逻辑与变量-----------
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

loginButton.addEventListener("click", function (event) {
  localName= usernameInput.value;
  if (localName.length > 0) {
    connect();
  }
});

function onLogin(success) {
  if (success === false) {
    alert("Login unsuccessful, please try a different name.");
  } else {
    loginPage.style.display = "none";
    callPage.style.display = "block";
    startConnection();
  }
};

var mineVideo = document.querySelector('#mine1'),
    their1Video = document.querySelector('#their1'),
    their2Video = document.querySelector('#their2'),
    their3Video = document.querySelector('#their3');

var yourConnection, connectedUser, stream1,stream2,stream3, dataChannel;

//1. 采集三路流
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

//2. 创建PC对象
function setupPeerConnection() {
  var configuration = {
    "iceServers": [{ "url": "stun:127.0.0.1:9876" }]
  };
  yourConnection = new RTCPeerConnection(configuration, {optional: [{RtpDataChannels: true}]});

  yourConnection.setLocalDescription(makeClientInitOffer(),function () {  },function (error) {
      console.log("error:"+error);
  });

  // Setup stream listening
  yourConnection.addStream(stream1);
  // yourConnection.addStream(stream2);
  // yourConnection.addStream(stream3);
  yourConnection.onaddstream = function (e) {
    if(their1Video.src == "") {
        their1Video.src = window.URL.createObjectURL(e.stream);
    }else if(their2Video.src == "") {
          their2Video.src = window.URL.createObjectURL(e.stream);
    }else if(their3Video.src == "") {
          their3Video.src = window.URL.createObjectURL(e.stream);
    }
  };

  yourConnection.onicecandidate = function (event) {
    if (event.candidate) {
      send(event.candidate);
    }
  };
}

//3. 呼叫按钮
callButton.addEventListener("click", function () {
  peer_id = theirUsernameInput.value;

  if (peer_id.length > 0) {
    startPeerConnection();
  }
});
//4. 呼叫开始，发送offer
function startPeerConnection() {
  yourConnection.createOffer(function (offer) {
    send(offer);
    yourConnection.setLocalDescription(offer);
  }, function (error) {
    alert("An error has occurred.");
  });
};

//5. 被呼叫端接收处理Offer
function onReceivedOffer(offer, name) {
  peer_id = name;
  yourConnection.setRemoteDescription(new RTCSessionDescription(offer));

  yourConnection.createAnswer(function (answer) {
    yourConnection.setLocalDescription(answer);

    send(answer);
  }, function (error) {
    alert("An error has occurred");
  });
};

//6. 呼叫端接收处理answer
function onReceivedAnswer(answer) {
  yourConnection.setRemoteDescription(new RTCSessionDescription(answer));
};

//7. 两端都需要处理的ice候选消息
function onReceivedCandidate(candidate) {
  yourConnection.addIceCandidate(new RTCIceCandidate(candidate));
};

//8.挂断按钮
hangUpButton.addEventListener("click", function () {
  onLeave();
});

//9. 挂断处理
function onLeave() {
  disconnect();
  connectedUser = null;
  their1Video.src = null;
  yourConnection.close();
  yourConnection.onicecandidate = null;
  yourConnection.onaddstream = null;
  setupPeerConnection(stream);
};

//10. 通用基础函数
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
function makeClientInitOffer() {
    var lines = [
        'v=0',
        'o=- 0 3 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'm=video 1 RTP/SAVPF 96',
        'b=AS:4096',
        'a=rtcp:1 IN IP4 0.0.0.0',
        'a=ice-ufrag:6HHHdzzeIhkE0CKj',
        'a=ice-pwd:XYDGVpfvklQIEnZ6YnyLsAew',
        'a=sendonly',
        'a=mid:video',
        'a=crypto:1 AES_CM_128_HMAC_SHA1_80 ' +
        'inline:Rlz8z1nMtwq9VF7j06kTc7uyio1iYuEdeZ7z1P9E',
        'a=rtpmap:96 H264/90000',
        'a=fmtp:96 x-google-start-bitrate=100000',
        'a=fmtp:96 x-google-min-bitrate=80000',
        'a=x-google-flag:conference'
    ];
    lines.push('');

    return new RTCSessionDescription( {
        'type': 'offer',
        'sdp': lines.join('\n')
    });
}