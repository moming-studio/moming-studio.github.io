var localName;
var request = null;
var hangingGet = null;
var server="http://127.0.0.1:8888";
var my_id = -1,peer_id=-1;
var other_peers = {};
var message_counter = 0;

function trace(txt) {
    console.log(txt);
    received.innerHTML += txt + "<br />";
    received.scrollTop = received.scrollHeight;
}
//---------------------------------与信令服务交互---------------------------------
//1. 连接服务器
function connect() {
    if (localName.length == 0) {
        alert("请先输入名字");
    } else {
        signIn();
    }
}

//2.登录
function signIn() {
    try {
        request = new XMLHttpRequest();
        request.async = true;
        request.onreadystatechange = signInCallback;
        request.open("GET", server + "/sign_in?" + localName, true);
        request.send();
    } catch (e) {
        alert("登录失败！")
        //trace("error: " + e.description);
    }
}

//3. 登录回调
function signInCallback() {
    try {
        if (request.readyState == 4) {
            if (request.status == 200) {
                var peers = request.responseText.split("\n");
                my_id = parseInt(peers[0].split(',')[1]);
                trace("我的id: " + my_id);
                for (var i = 1; i < peers.length; ++i) {
                    if (peers[i].length > 0) {
                        var parsed = peers[i].split(',');
                        trace("用户"+parsed[0]+"，id:" + parsed[1]+",在线");
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
        hangingGet.async = true;
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
        alert("Hanging get error: " + e.description);
        disconnect();
    }
}

//7. 服务器通过消息，主要是用户列表
function handleServerNotification(data) {
    //trace("Server notification: " + data);
    var parsed = data.split(',');
    if (parseInt(parsed[2]) != 0)
    {
        trace("用户"+parsed[0]+"，id:" + parsed[1]+",上线");
        other_peers[parseInt(parsed[1])] = parsed[0];
    }else{
        trace("用户"+parsed[0]+"，id:" + parsed[1]+",下线");
        if(parsed[1] === peer_id)
            hungup();
    }
}

//8. 处理peer发过来的消息
function handlePeerMessage(peer_id, text) {
    ++message_counter;
    var str = "Message from '" + other_peers[peer_id] + "':"+text;
    trace(str);
    if(text.indexOf("BYE") >= 0 ){
        hungup();
        return;
    }
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
    }else if(data.num_session){
        onReceivedAnswerSSdp(data);;
    }
}

function GetIntHeader(r, name) {
    var val = r.getResponseHeader(name);
    return val != null && val.length ? parseInt(val) : -1;
}

//9. 发送消息给对方
function send(obj) {
    var data= JSON.stringify(obj);
    if (!data.length || peer_id <= 0) {
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
        r.async = true;
        r.open("POST", server + "/message?peer_id=" + my_id + "&to=" + peer_id,
            false);
        r.setRequestHeader("Content-Type", "text/plain");
        //data = data.replace(new RegExp("192.168.31.147","gm"),"192.168.31.148");
        r.send(data);
        trace("send:"+data);
        r = null;
    }
}

//---------------------------------与信令服务交互结束---------------------------------

//---------------------------------界面逻辑与变量开始---------------------------------
var loginPage = document.querySelector('#login-page'),
    serverInput = document.querySelector('#server'),
    usernameInput = document.querySelector('#username'),
    loginButton = document.querySelector('#login'),
    callPage = document.querySelector('#call-page'),
    theirUsernameInput = document.querySelector('#their-username'),
    callButton = document.querySelector('#call'),
    hangUpButton = document.querySelector('#hang-up'),
    logoutButton = document.querySelector('#logout'),
    //messageInput = document.querySelector('#message'),
    sendButton = document.querySelector('#send'),
    received = document.querySelector('#received'),
    sendAudio = document.querySelector('#cb_audio'),
    sendVideoCount = document.querySelector('#select_videocount')

var mineVideo = document.querySelector('#mine1'),     //采集视频1
    their1Video = document.querySelector('#their1'),  //接收视频1
    their2Video = document.querySelector('#their2'),  //接收视频2
    their3Video = document.querySelector('#their3');  //接收视频3

var peerConn, connectedUser, stream1,stream2,stream3

callPage.style.display = "none";

//登录事件
loginButton.addEventListener("click", function (event) {
    server = serverInput.value;
  localName= usernameInput.value;
  if (localName.length > 0) {
    connect();
  }
});

//登录成功回调
function onLogin(success) {
  if (success === false) {
    alert("Login unsuccessful, please try a different name.");
  } else {
    loginPage.style.display = "none";
    callPage.style.display = "block";
  }
};

//1. 采集三路流
function getMedia() {
  var is_send_audio =  sendAudio.checked;
  var send_video_count = sendVideoCount.selectedIndex;
  if (!hasUserMedia() || !hasRTCPeerConnection()) {
      alert("抱歉，你的浏览器不支持WebRTC");
      return ;
  }
  if(is_send_audio == true || send_video_count>0) {
      var resulations = [
          false,
          {width: {exact: 320}, height: {exact: 180}},
          {width: {exact: 640}, height: {exact: 360}},
          {width: {exact: 1280}, height: {exact: 720}}];
      for(var i = send_video_count; i>=0;i--)
      trace("resulations["+i+"]:"+JSON.stringify(resulations[i]));
      //获取第一路流
      navigator.getUserMedia({audio: is_send_audio, video:resulations[send_video_count]}, function (mystream1) {
          stream1 = mystream1;
          mineVideo.srcObject = stream1;
          if(send_video_count>=2) {
              //获取第二路流
              navigator.getUserMedia({audio: false,video: resulations[send_video_count-1]}, function (mystream2) {
                  stream2 = mystream2;
                  mineVideo.srcObject = stream2;
                  if(send_video_count>=3) {
                      //获取第三路流
                      navigator.getUserMedia({audio: false,video: resulations[send_video_count-2]}, function (mystream3) {
                          stream3 = mystream3;
                          mineVideo.srcObject = stream3;//window.URL.createObjectURL(stream3);
                          //开始连接
                          startPeerConnection();
                      }, function (error) {
                          alert("第三路视频采集失败:"+error);
                          console.log(error);
                      });
                  }else{
                      //开始连接
                      startPeerConnection();
                  }
              }, function (error) {
                  alert("第二路视频采集失败:"+error);
                  console.log(error);
              });
          }else{
              //开始连接
              startPeerConnection();
          }
      }, function (error) {
          alert("第一路音视频采集失败:"+error);
          console.log(error);
      });
  }
}

//2. 创建PC对象
function setupPeerConnection() {
    var configs = { iceServers: [ ], rtcpMuxPolicy: 'require' };
    var constraints = { 'mandatory': { 'DtlsSrtpKeyAgreement': false } };
  peerConn = new RTCPeerConnection(configs, constraints/*{optional: [{RtpDataChannels: true}]}*/);
    // 预设值一个offer
    peerConn.setLocalDescription(makeClientInitOffer("offer"),function () {  },function (error) {
        alert("setLocalDescription error:"+error);
    });
}

//4. 呼叫开始，发送offer
function startPeerConnection() {

    // Setup stream listening
    if(stream1){
        peerConn.addStream(stream1);
    }
    if(stream2){
        peerConn.addStream(stream2);
    }
    if(stream3){
        peerConn.addStream(stream3);
    }

    peerConn.ontrack = function (e) {
        if(their1Video.srcObject == null) {
            their1Video.srcObject = e.streams[0];
        }else if(their2Video.srcObject == null) {
            their2Video.srcObject = e.streams[0];
        }else if(their3Video.srcObject == null) {
            their3Video.srcObject = e.streams[0];
        }
    }
    // peerConn.onaddstream = function (e) {
    //     if(their1Video.srcObject == null) {
    //         their1Video.srcObject = e.stream;
    //     }else if(their2Video.srcObject == null) {
    //         their2Video.srcObject = e.stream;
    //     }else if(their3Video.srcObject == null) {
    //         their3Video.srcObject = e.stream;
    //     }else{
    //         console.log("error : on show 3 streams");
    //     }
    // };

    peerConn.onicecandidate = function (event) {
        trace("==========="+JSON.stringify(event.candidate));
        //addServerCandidate();
        if (event.candidate) {
            //send(event.candidate);
        }
    };

    // peerConn.setLocalDescription(makeClientInitOffer("offer"),function () {  },function (error) {
    //     console.log("error:"+error);
    // });


  peerConn.createOffer(function (offer) {

    send(getSimpleSdp(offer.sdp));
    peerConn.setLocalDescription(offer);
  }, function (error) {
    alert("setLocalDescription error has occurred.");
  });
};

//5. 被呼叫端接收处理Offer，不会用到，浏览器端才是offer。
function onReceivedOffer(offer, name) {
  peer_id = name;

    // peerConn.setLocalDescription(makeClientInitOffer("answer"),function () {  },function (error) {
    //     console.log("error:"+error);
    // });
    // peerConn.setRemoteDescription(makeClientInitOffer("offer"),function () {  },function (error) {
    //     console.log("error:"+error);
    // });

  peerConn.setRemoteDescription(new RTCSessionDescription(offer),function () {  },function (error) {
        alert("setRemoteDescription error has occurred:"+error);
    });

  peerConn.createAnswer(function (answer) {
    peerConn.setLocalDescription(answer,function () {
        addServerCandidate();
    },function (error) {
        alert("setLocalDescription error has occurred:"+error);
    });

    send(answer);
  }, function (error) {
    alert("createAnswer error has occurred:"+error);
  });
};

//6. 呼叫端接收处理answer,标准sdp，不会用到
function onReceivedAnswer(answer) {
    // getStdSDP(answer);
    peerConn.setRemoteDescription(new RTCSessionDescription(answer),function () {
        addServerCandidate();
    },function (error) {
        alert("setRemoteDescription error has occurred:"+error);
    });
};

//7. 收到简易sdp answer
function onReceivedAnswerSSdp(answer) {
    var ssdp = getStdSDP(answer);
    console.log(JSON.stringify(ssdp))
    peerConn.setRemoteDescription(ssdp,function () {
        addServerCandidate();
    },function (error) {
        alert("setRemoteDescription error has occurred:"+error);
    });

};

//8. 手动添加ice，未用到
function addServerCandidate()
{
    cand = "{" +
        "\"candidate\": \"candidate:3245670104 1 udp 2122260223 192.168.31.147 9527 typ host generation 0 ufrag uQTw network-id 3 network-cost 50\"," +
        "\"sdpMLineIndex\": 0," +
        "\"sdpMid\":\"audio\"" +
        "}"

    cand2 = "{" +
        "\"candidate\": \"candidate:3245670104 1 udp 2122260223 192.168.31.147 9527 typ host generation 0 ufrag uQTw network-id 3 network-cost 50\"," +
        "\"sdpMLineIndex\": 0," +
        "\"sdpMid\":\"video\"" +
        "}"

    peerConn.addIceCandidate(new RTCIceCandidate(JSON.parse(cand)));
    peerConn.addIceCandidate(new RTCIceCandidate(JSON.parse(cand2)));
}

//9. 两端都需要处理的ice候选消息，未用到
function onReceivedCandidate(candidate) {
    console.log("onReceivedCandidate:"+candidate);
    //peerConn.addIceCandidate(new RTCIceCandidate(candidate));
};

function resetStream() {
    if(peerConn) {
        if(stream1 != null) {
            peerConn.removeStream(stream1);
        }
        if(stream2 != null) {
            peerConn.removeStream(stream2);
        }
        if(stream3 != null) {
            peerConn.removeStream(stream3);
        }
    }
    if(stream1) {
        var tracks = stream1.getTracks();
        tracks.forEach(function (track) {
            track.stop();
            stream1.removeTrack(track);
        });
    }
    if(stream2) {

        var tracks = stream2.getTracks();
        tracks.forEach(function (track) {
            track.stop();
            stream2.removeTrack(track);
        });
        mineVideo.srcObject = null;
    }
    if(stream3) {
        var tracks = stream3.getTracks();
        tracks.forEach(function (track) {
            track.stop();
            stream3.removeTrack(track);
        });
    }
    mineVideo.srcObject = null;
    stream1 = null;
    stream2 = null;
    stream3 = null;

    their1Video.srcObject = null;
    their2Video.srcObject = null;
    their3Video.srcObject = null;
}
//10. 挂断
function hungup() {

    callButton.value = "呼叫";
    if(peer_id>0) {
        send("BYE");
    }
    if(peerConn) {
        if(stream1 != null) {
            peerConn.removeStream(stream1);
        }
        if(stream2 != null) {
            peerConn.removeStream(stream2);
        }
        if(stream3 != null) {
            peerConn.removeStream(stream3);
        }
        peerConn.close();
        peerConn = null;
    }
    connectedUser = null;
    peer_id = -1;

    resetStream();

    received.innerHTML = "已挂断";
    received.scrollTop = received.scrollHeight;
}

//11. 登出，断开连接
function disconnect() {
    hungup();
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
        request.async = true;
        request.open("GET", server + "/sign_out?peer_id=" + my_id, false);
        request.send();
        request = null;
        my_id = -1;
    }
    loginPage.style.display = "block";
    callPage.style.display = "none";
}

//3. 呼叫按钮
callButton.addEventListener("click", function () {
    if(peerConn == null) {
        peer_id = theirUsernameInput.value;

        if (peer_id.length > 0) {
            setupPeerConnection();
            getMedia();
            callButton.value = "更新流";
        } else {
            alert("请先输入对方id");
        }
    }else{
        resetStream();
        getMedia();
    }
});

//8.挂断按钮
hangUpButton.addEventListener("click", function () {
    hungup();
});

//11.登出
logoutButton.addEventListener("click", function () {
    disconnect();
});
window.onbeforeunload = disconnect;


//---------------------------------通用基础函数开始---------------------------------
//是否要采集音视频接口
function hasUserMedia() {
    navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    return !!navigator.getUserMedia;
}

//是否有pc接口
function hasRTCPeerConnection() {
    window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    window.RTCSessionDescription = window.RTCSessionDescription || window.webkitRTCSessionDescription || window.mozRTCSessionDescription;
    window.RTCIceCandidate = window.RTCIceCandidate || window.webkitRTCIceCandidate || window.mozRTCIceCandidate;
    return !!window.RTCPeerConnection;
}

//手动创建一个初始化的sdp
function makeClientInitOffer(type) {
    var lines = [
        "v=0",
        "o=- 3260245280620985152 2 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0",
        "a=group:BUNDLE audio video",
        "a=msid-semantic: WMS stream_id_0",
        "m=audio 9527 RTP/SAVPF 99",
        "c=IN IP4 0.0.0.0",
        "a=rtcp:9 IN IP4 0.0.0.0",
        //"a=candidate:3245670104 1 udp 2122260223 192.168.31.147 9527 typ host generation 0 network-id 3 network-cost 50",
        "a=ice-ufrag:uQTw",
        "a=ice-pwd:eyTnvXsgvLmB8wNyt+22zS+2",
        "a=ice-options:trickle",
        "a=mid:audio",
        "a=sendrecv",
        "a=rtcp-mux",
        "a=crypto:0 AES_CM_128_HMAC_SHA1_80 inline:FwWzrBwEjxpvK+MCxzGnBmSIcHpp540Hn9xGP63x",
        "a=rtpmap:99 opus/48000/2",
        "a=rtcp-fb:99 transport-cc",
        "a=fmtp:99 minptime=10;useinbandfec=1",
        "a=ssrc:582569326 cname:EwB0Llm8Wtt67bvR",
        "a=ssrc:582569326 msid:stream_id_0 audio_label",
        "a=ssrc:582569326 mslabel:stream_id_0",
        "a=ssrc:582569326 label:audio_label",
        "m=video 9527 RTP/SAVPF 100 101",
        "c=IN IP4 0.0.0.0",
        "a=rtcp:9 IN IP4 0.0.0.0",
        //"a=candidate:3245670104 1 udp 2122260223 192.168.31.147 9527 typ host generation 0 network-id 3 network-cost 50",
        "a=ice-ufrag:uQTw",
        "a=ice-pwd:eyTnvXsgvLmB8wNyt+22zS+2",
        "a=ice-options:trickle",
        "a=mid:video",
        "a=sendrecv",
        "a=rtcp-mux",
        "a=rtcp-rsize",
        "a=crypto:0 AES_CM_128_HMAC_SHA1_80 inline:FwWzrBwEjxpvK+MCxzGnBmSIcHpp540Hn9xGP63x",
        "a=rtpmap:100 H264/90000",
        "a=rtcp-fb:100 goog-remb",
        "a=rtcp-fb:100 transport-cc",
        "a=rtcp-fb:100 ccm fir",
        "a=rtcp-fb:100 nack",
        "a=rtcp-fb:100 nack pli",
        "a=fmtp:100 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f",
        "a=rtpmap:101 rtx/90000",
        "a=fmtp:101 apt=100",
        "a=ssrc-group:FID 3308843176 3430100014",
        "a=ssrc:3308843176 cname:EwB0Llm8Wtt67bvR",
        "a=ssrc:3308843176 msid:stream_id_0 video_label_0",
        "a=ssrc:3308843176 mslabel:stream_id_0",
        "a=ssrc:3308843176 label:video_label_0",
        "a=ssrc:3430100014 cname:EwB0Llm8Wtt67bvR",
        "a=ssrc:3430100014 msid:stream_id_0 video_label_0",
        "a=ssrc:3430100014 mslabel:stream_id_0",
        "a=ssrc:3430100014 label:video_label_0",
        // 'v=0',
        // 'o=- 0 3 IN IP4 127.0.0.1',
        // 's=-',
        // 't=0 0',
        // 'm=video 1 RTP/SAVPF 96',
        // 'b=AS:4096',
        // 'a=rtcp:1 IN IP4 0.0.0.0',
        // 'a=ice-ufrag:6HHHdzzeIhkE0CKj',
        // 'a=ice-pwd:XYDGVpfvklQIEnZ6YnyLsAew',
        // 'a=sendonly',
        // 'a=mid:video',
        // 'a=crypto:1 AES_CM_128_HMAC_SHA1_80 ' +
        // 'inline:Rlz8z1nMtwq9VF7j06kTc7uyio1iYuEdeZ7z1P9E',
        // 'a=rtpmap:96 H264/90000',
        // 'a=fmtp:96 x-google-start-bitrate=100000',
        // 'a=fmtp:96 x-google-min-bitrate=80000',
        // 'a=x-google-flag:conference'
    ];
    lines.push('');

    return new RTCSessionDescription( {
        'type': type,
        'sdp': lines.join('\n')
    });
}

//标准sdp转简易sdp
function getSimpleSdp(stdSdp) {

    var SimSDP = {
        isanswer: 0,
        ip: "",
        port: 0,
        cname: "",
        num_session: 0,
        session: []
    };

    var sdpLines = stdSdp.split('\r\n');

    //--------获取cname--------
    var mLineIndex = findLine(sdpLines, 'a=ssrc',"cname");
    if (mLineIndex === null) {
        return null;
    }
    SimSDP.cname = sdpLines[mLineIndex].split("cname:")[1];

    //--------hasAudio or has Video--------
    var hasAudio = findLine(sdpLines, 'a=group:BUNDLE', "audio") != null;
    var hasVideo = findLine(sdpLines, 'a=group:BUNDLE', "video") != null;
    if(hasAudio)
    {
        var startLine = findLine(sdpLines, 'm=audio',null);
        var endLine  = findLine(sdpLines, 'm=video',null);
        if(endLine == null)
            endLine = -1;

        var session ={
            codec: 0,
            direction:0,
            ssrc:0,
            rtxssrc: 0,
            ice_ufrag:"",
            ice_pwd: "",
            i_enabled_srtp: 1,
            srtp_key:""
        };
        session.codec = 99;
        mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=ice-ufrag:",null);
        session.ice_ufrag = sdpLines[mLineIndex].split(":")[1];
        mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=ice-pwd:",null);
        session.ice_pwd = sdpLines[mLineIndex].split(":")[1];
        session.i_enabled_srtp =  1;
        mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=","inline");
        session.srtp_key = sdpLines[mLineIndex].split("inline:")[1];

        var direction = 3;
        mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=inactive",null);
        if(mLineIndex != null){
            direction = 0;
        }else{
            mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=sendonly",null);
            if(mLineIndex  != null){
                direction = 1;
            }else{
                mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=recvonly",null);
                if(mLineIndex  != null){
                    direction = 2;
                }else{
                    mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=sendrecv",null);
                    if(mLineIndex  != null)
                        direction =3;
                }
            }
        }
        session.direction = direction;

        if(direction == 1 || direction == 3) {
            mLineIndex = findLineInRange(sdpLines, startLine, endLine, "a=ssrc:", null);
            if (mLineIndex != -1)
                session.ssrc = sdpLines[mLineIndex].split(":")[1].split(" ")[0];
        }else{
            session.ssrc="";
        }
        session.rtxssrc = "";
        SimSDP.session.push(session);
    }
    if(hasVideo)
    {
        var startLine = findLine(sdpLines, 'm=video',null);
        var endLine  = findLine(sdpLines, 'a=ssrc-group:FID',null);
        mLineIndex = findLineInRange(sdpLines, startLine, endLine, "a=ice-ufrag:", null);
        var ice_ufrag = sdpLines[mLineIndex].split(":")[1];
        mLineIndex = findLineInRange(sdpLines, startLine, endLine, "a=ice-pwd:", null);
        var ice_pwd = sdpLines[mLineIndex].split(":")[1];
        mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=","inline");
        var srtp_key = sdpLines[mLineIndex].split("inline:")[1];

        var direction = 3;
        mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=inactive",null);
        if(mLineIndex  != null){
            direction = 0;
        }else{
            mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=sendonly",null);
            if(mLineIndex != null){
                direction = 1;
            }else{
                mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=recvonly",null);
                if(mLineIndex != null){
                    direction = 2;
                }else{
                    mLineIndex = findLineInRange(sdpLines,startLine,endLine,"a=sendrecv",null);
                    if(mLineIndex != null)
                        direction =3;
                }
            }
        }
        while(endLine != null) {
            var session ={
                codec: 0,
                direction:0,
                ssrc:0,
                rtxssrc: 0,
                ice_ufrag:"",
                ice_pwd: "",
                i_enabled_srtp: 1,
                srtp_key:""
            };
            session.codec = 100;
            session.direction = direction;

            if(direction == 1 || direction == 3) {
                session.ssrc = sdpLines[endLine].split(" ")[1];
                session.rtxssrc = sdpLines[endLine].split(" ")[2];
            }else{
                session.ssrc = "";
                session.rtxssrc = "";
            }
            session.ice_ufrag = ice_ufrag;
            session.ice_pwd = ice_pwd;
            session.i_enabled_srtp = 1;
            session.srtp_key =srtp_key;
            SimSDP.session.push(session);
            startLine = endLine+1;
            endLine  = findLineInRange(sdpLines,startLine,-1,'a=ssrc-group:FID',null);
        }
    }
    SimSDP.num_session = SimSDP.session.length;
    return SimSDP;
}

//简易sdp转标准sdp
function getStdSDP(simSdp) {

    var mSessionId = (function () {
        return Math.random().toString().substr(2, 21);
    })();

    var audio_count = (function(){
        var count = 0;
        simSdp.session.forEach(function (session) {
            if(session.codec == 99) {
                count ++;
            }
        });
        return count;
    })();

    var video_count = (function(){
        var count = 0;
        simSdp.session.forEach(function (session) {
            if(session.codec == 100) {
                count ++;
            }
        });
        return count;
    })();

    var has_audio = audio_count > 0;
    var has_video = video_count > 0;
    var lines = [
        "v=0",
        "o=- "+mSessionId+" 2 IN IP4 127.0.0.1",
        "s=-",
        "t=0 0"
    ];
    if(has_audio || has_video)
        lines.push("a=group:BUNDLE"+(has_audio?" audio":"")+(has_video?" video":""));

    var line = "a=msid-semantic: WMS";
    if (has_audio || has_video) {
        for (var i = 0; i < Math.max(audio_count,video_count); i++) {
            line +=(" stream_id_" + i);
        }
    }
    lines.push(line);

    if (has_audio) {
        lines.push("m=audio 9 RTP/SAVPF 99");
        lines.push("c=IN IP4 0.0.0.0");
        if (simSdp.ip.length>=8 && simSdp.port >0)
        {
            lines.push("a=rtcp:"+simSdp.port+" IN IP4 "+simSdp.ip);
            lines.push("a=candidate:3245670104 1 udp 2122260223 "+simSdp.ip+" "+simSdp.port+" typ host generation 0 network-id 3 network-cost 50");
        }else {
            lines.push("a=rtcp:9 IN IP4 0.0.0.0");
        }
        lines.push("a=ice-ufrag:"+simSdp.session[0].ice_ufrag);
        lines.push("a=ice-pwd:"+simSdp.session[0].ice_pwd);
        lines.push("a=ice-options:trickle")
        lines.push("a=mid:audio");
        if (simSdp.session[0].direction == 0) {
            lines.push("a=inactive");
        }else if (simSdp.session[0].direction == 1) {
            lines.push("a=sendonly");
        }else if (simSdp.session[0].direction == 2) {
            lines.push("a=recvonly");
        }else /*if (simSdp.session[0].direction == 3)*/ {
            lines.push("a=sendrecv");
        }
        //lines.push("a=sendrecv");
        lines.push("a=rtcp-mux");
        lines.push("a=crypto:0 AES_CM_128_HMAC_SHA1_80 inline:"+simSdp.session[0].srtp_key);
        lines.push("a=rtpmap:99 opus/48000/2");
        lines.push("a=rtcp-fb:99 transport-cc");
        lines.push("a=fmtp:99 minptime=10;useinbandfec=1");
        lines.push("a=ssrc:"+simSdp.session[0].ssrc+" cname:"+simSdp.cname);
        lines.push("a=ssrc:"+simSdp.session[0].ssrc+" msid:stream_id_0 audio_label");
        lines.push("a=ssrc:"+simSdp.session[0].ssrc+" mslabel:stream_id_0");
        lines.push("a=ssrc:"+simSdp.session[0].ssrc+" label:audio_label");
    }
    if (has_video) {
        var index = has_audio?1:0;
        lines.push("m=video 9 RTP/SAVPF 100 101");
        lines.push("c=IN IP4 0.0.0.0");
        if (simSdp.ip.length>=8 && simSdp.port >0)
        {
            lines.push("a=rtcp:"+simSdp.port+" IN IP4 "+simSdp.ip);
            lines.push("a=candidate:3245670104 1 udp 2122260223 "+simSdp.ip+" "+simSdp.port+" typ host generation 0 network-id 3 network-cost 50");
        }else {
            lines.push("a=rtcp:9 IN IP4 0.0.0.0");
        }
        lines.push("a=ice-ufrag:"+simSdp.session[index].ice_ufrag);
        lines.push("a=ice-pwd:"+simSdp.session[index].ice_pwd)
        lines.push("a=ice-options:trickle");

        lines.push("a=mid:video");
        if (simSdp.session[index].direction == 0) {
            lines.push("a=inactive");
        }else if (simSdp.session[index].direction == 1) {
            lines.push("a=sendonly");
        }else if (simSdp.session[index].direction == 2) {
            lines.push("a=recvonly");
        }else /*if (simSdp.session[index].direction == 3)*/ {
            lines.push("a=sendrecv");
        }
        //lines.push("a=sendrecv");
        lines.push("a=rtcp-mux");
        lines.push("a=rtcp-rsize");
        lines.push("a=crypto:0 AES_CM_128_HMAC_SHA1_80 inline:"+simSdp.session[index].srtp_key);
        lines.push("a=rtpmap:100 H264/90000");
        lines.push("a=rtcp-fb:100 goog-remb");
        lines.push("a=rtcp-fb:100 transport-cc");
        lines.push("a=rtcp-fb:100 ccm fir");
        lines.push("a=rtcp-fb:100 nack");
        lines.push("a=rtcp-fb:100 nack pli");
        lines.push("a=fmtp:100 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f");
        lines.push("a=rtpmap:101 rtx/90000");
        lines.push("a=fmtp:101 apt=100");

        for (var i = 0; i < video_count; i++)
        {
            var rtp_ssrc = simSdp.session[index+i].ssrc;
            var rtx_ssrc = simSdp.session[index+i].rtxssrc;
            lines.push("a=ssrc-group:FID "+ rtp_ssrc + " "+ rtx_ssrc);
            lines.push("a=ssrc:"+ rtp_ssrc + " cname:" +simSdp.cname);
            lines.push("a=ssrc:"+ rtp_ssrc + " msid:stream_id_"+ i + " video_label_"+ i);
            lines.push("a=ssrc:"+ rtp_ssrc + " mslabel:stream_id_"+ i);
            lines.push("a=ssrc:"+ rtp_ssrc + " label:video_label_"+ i );
            lines.push("a=ssrc:"+ rtx_ssrc + " cname:"+simSdp.cname);
            lines.push("a=ssrc:"+ rtx_ssrc + " msid:stream_id_"+i + " video_label_"+ i);
            lines.push("a=ssrc:"+ rtx_ssrc + " mslabel:stream_id_"+ i);
            lines.push("a=ssrc:"+ rtx_ssrc + " label:video_label_"+ i);
        }
    }
    lines.push('');
    console.log("recv ssdp to sdp:");
    lines.forEach(function (value) {
       console.log(value);
    });
    return new RTCSessionDescription( {
        'type': "answer",//(simSdp.isanswer == 1?"answer":"offer"),
        'sdp': lines.join("\r\n")
    });

}

//在sdp string中查找行
function findLine(sdpLines, prefix, substr) {
    return findLineInRange(sdpLines, 0, -1, prefix, substr);
}

//在sdp string中查找行
function findLineInRange(sdpLines, startLine, endLine, prefix, substr) {
    var realEndLine = endLine !== -1 ? endLine : sdpLines.length;
    for (var i = startLine; i < realEndLine; ++i) {
        if (sdpLines[i].indexOf(prefix) === 0) {
            if (!substr ||
                sdpLines[i].toLowerCase().indexOf(substr.toLowerCase()) !== -1) {
                return i;
            }
        }
    }
    return null;
}
//---------------------------------通用基础函数结束---------------------------------


window.setInterval(function() {
    if (!peerConn) {
        return;
    }
    peerConn.getStats(null).then(function(res) {
        res.forEach(function(report) {
            if (report.type === 'inbound-rtp')
            {
                //mediaType":"audio","firCount":0,"pliCount":51,"nackCount":430,"packetsReceived":210,"bytesReceived":132285,"packetsLost":203,"fractionLost":0.49609375,
                trace("统计:接收"
                   +report.mediaType
                   +",关键帧请求次数:"+report.pilCount
                   +",重传请求次数:"+report.nackCount
                   +",接收包个数:"+report.packetsReceived
                   +",接收字节数:"+report.bytesReceived
                   +",丢包个数:"+report.packetsLost
                   +",丢包率:"+report.fractionLost);
            }else  if (report.type === 'outbound-rtp') {
                //"mediaType":"audio","packetsSent":3181,"bytesSent":77422
                trace("统计:发送"
                    +report.mediaType
                    +",发送包个数:"+report.packetsSent
                    +",发送字节数:"+report.bytesSent);
            }
        });
    });
}, 10000);
