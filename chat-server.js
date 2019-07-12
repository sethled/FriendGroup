var http = require("http"),
	socketio = require("socket.io"),
	url = require('url'),
	path = require('path'),
	fs = require("fs");

let linkParse;

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function (req, resp) {
	// This callback runs when a new connection is made to our HTTP server.

	linkParse = url.parse(req.url).pathname;
	linkParse = linkParse.slice(1);
	linkParse = linkParse.replace(/ /g, "-")

	fs.readFile("client.html", function (err, data) {
		// This callback runs when the client.html file has been read from the filesystem.
		if (err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});
app.listen(3456);

const users = {};
const groups = {};

users['username'] = {
	'username': "username",
	'password': "password",
	'email': "email@email.com",
	'friendname': "somefriendname",
	'friendGroup': "somefriendgroup",
	'madeAGroup': false
}

// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function (socket) {
	// This callback runs when a new Socket.IO connection is established.

	socket.on("fileMessage_to_server", function(data){
		if (data.group != "none") {
			let msgArray = ["file", data.fileName, data.fileLink, data.friendname];
			groups[data.group].chatLog.push(msgArray);
			console.log(groups);
			// groups[data.group].chatLog.push(data.message);
			console.log("fileMessage_to_server received on server-side, and registered as group not being = to none.");
			io.to(data["group"]).emit("fileMessage_to_client", {fileLink: data.fileLink, fileName: data.fileName, friendname: data.friendname}); // broadcast the message to other users
		}
	});

	// sends text from link to socket.
	socket.emit("linkParse", { string: linkParse });

	// runs whenever a user attempts to log back into an account.
	socket.on('login', function (data) {

		if (users[data.user] === undefined) {
			socket.emit("userLoggedIn", { value: false });
			//console.log(friendnamesObj[data.user]);
		}

		else {
			if (users[data.user].password === data.pass) {
				console.log(users[data.user].friendGroup);
				let gRoom = users[data.user].friendGroup;
				socket.join(gRoom);
				if (gRoom != "none") {
					let tChatLog = groups[gRoom].chatLog;
					socket.emit("userLoggedIn", { value: true, friendname: users[data.user].friendname, friendGroup: users[data.user].friendGroup, user: users[data.user].username, chatlog: tChatLog });
				}

				else{
					socket.emit("userLoggedIn", { value: true, friendname: users[data.user].friendname, friendGroup: users[data.user].friendGroup, user: users[data.user].username, chatlog: [] });
				}
			}

			else { socket.emit("userLoggedIn", { value: false }); }
		}
	});

	// runs whenever a new user attempts to register for an account.
	socket.on('register', function (data) {
		console.log("running register.")

		if (users[data.user] === undefined) {
			users[data.user] = {
				'username': data.user,
				'password': data.pass,
				'email': data.email,
				'friendname': data.friendname,
				'friendGroup': "none",
				'madeAGroup': false
			}
			socket.emit("registeredUser", { value: true });
		}

		else {
			socket.emit("registeredUser", { value: false });
		}
	});

	// receives request for an update to a user's friendname, and makes the necessary changes backend (here).
	socket.on("friendNameUpdate", function (data) {
		users[data.user].friendname = data.friendname;
		console.log(users);
	});

	// receives prompt, and follows through on request for a user to join a new group/create a new group here:
	socket.on("joininggroup", function (data) {
		let username = data.user;
		let friendname = data.friendname;
		socket.join(data.newgroup);
		io.to(data.newgroup).emit("message_to_client", { message: username + " has joined the group!" }); // broadcast the message to other users
		users[data.user].friendGroup = data.newgroup;
	});

	socket.on("doeskeyexist", function (group) {
		let dke = false;
		for (let i in groups) {
			if (groups.hasOwnProperty(i)) {
				if (groups[i]['key'] === group.key) {
					dke = true;
				}
			}
		}

		socket.emit("keyexists", { cfb: group.cfb, value: dke, key: group.key });
	});

	socket.on("joinGroup", function (data) {
		let tGroupName;
		let tChatLog;
		let passCorrect = false;
		for (let i in groups) {
			if (groups.hasOwnProperty(i)) {
				if (groups[i]['key'] === data.key) {
					tGroupName = groups[i]['name'];
					tChatLog = groups[i]['chatLog'];
					if (data.pass === groups[i]['password']) {
						passCorrect = true;
					}
				}
			}
		}

		if (passCorrect) {
			socket.join(tGroupName);
			users[data.user].friendGroup = tGroupName;
			socket.emit("confirmJoin", { joined: true, groupname: tGroupName, chatlog: tChatLog });
		}

		else { socket.emit("confirmJoin", { joined: false }); }
	});

	socket.on('message_to_server', function (data) {
		// This callback runs when the server receives a new message from the client.
		if (data.group != "none") {
			let msgArray = ["text", data.message];
			groups[data.group].chatLog.push(msgArray);
			console.log(groups);
			console.log("message: " + data["message"]); // log it to the Node.JS output
			console.log(groups[data.group].chatLog);
			io.to(data["group"]).emit("message_to_client", { message: data["message"], private: false }); // broadcast the message to other users
		}
	});

	socket.on('addgroup', function (data) {
		let agk = false;
		for (let i in groups) {
			if (groups.hasOwnProperty(i)) {
				if (groups[i]['key'] === data.key) {
					agk = true;
				}
			}
		}

		if (agk) {
			socket.emit("groupAdded", { value: false, reason: "keyTaken" });
		}

		else if (users[data.user].madeAGroup) {
			socket.emit("groupAdded", { value: false, reason: "madeGroup" });
		}

		else {
			let addedgroupName = data["group"];
			groups[addedgroupName] = {
				'name': addedgroupName,
				'activeUsers': [],
				'owner': data.user,
				'bannedUsers': [],
				'password': data.pass,
				'key': data.key,
				'chatLog': []
			};

			socket.emit("groupAdded", { group: addedgroupName, key: data.key, value: true });
			users[data.user].friendGroup = addedgroupName;
			users[data.user].madeAGroup = true;
		}
	});
});
