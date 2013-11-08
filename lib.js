function PeerMgr(node) {
	this.peers = {};
	this.amt = 0;
	this.statusCallback = null;
	this.stack = [];

	this.exists = function(p) {
		if (this.peers.hasOwnProperty(p))
			return true;

		return false;
	}

	this.add = function(p) {
		if (this.amt>=node.maxpeers)
			return false; // already enough peers

		p = parseInt(p);

		if (this.exists(p))
			return false; // already connected

		if(node.id==0)
			node.parent.con++;

		this.amt += 1;
		this.peers[p] = {};
		this.stack.push(p)
		node.parent.connect(node.id, p);

		return true;
	}

	this.set = function(p, status) {
		if (!this.peers.hasOwnProperty(p))
			return -1;
		else
			this.peers[p] = status;
	}

	this.get = function(p) {
		if (!this.peers.hasOwnProperty(p))
			return -1;
		else
			return this.peers[p];
	}

	this.random = function() {
		var result;
	    var count = 0;
	    for (var prop in this.peers)
	        if (Math.random() < 1/++count)
	           result = prop;
	    return parseInt(result);
	}

	this.last = function() {
		return this.stack[this.stack.length-1]
	}

	this.remove = function(p) {
		p = parseInt(p);

		if(node.id==0)
			node.parent.con--;

		if (!this.peers.hasOwnProperty(p))
			return false;

		this.amt -= 1;
		delete this.peers[p];
		node.parent.disconnect(node.id, p);

		delete this.stack[this.stack.indexOf(p)]

		return true;
	}

	this.all = function(func) {
		for (var id in this.peers) {
			id = parseInt(id);
			func(node, id);
		}
	}
};

function s4() {
  return Math.floor((1 + Math.random()) * 0x10000)
             .toString(16)
             .substring(1);
};

function guid() {
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
         s4() + '-' + s4() + s4() + s4();
}

function Blockchain(node) {
	this.h = 1;
	this.color = "black";
	this.revenue = {};
	this.history = ["genesis"];

	this.privatestack = [{h : this.h, color: this.color, history: jQuery.extend(true, [], this.history), revenue: jQuery.extend(true, {}, this.revenue)}]

	this.height = function() {
		return this.h;
	}

	this.chainstate = function() {
		return {height:this.h,color:this.color,revenue:this.revenue,history:this.history};
	}

	this.newstate = function(msg) {
		if (msg.height <= this.h) {
			return;
		}

		if (node.attackmode == true) {
			/***** ATTACK MODE *****/
			// In attack mode, when we receive a new chainstate, we need to compare it with our private
			// chainstate. If our private chainstate is at the same height, we need to immediately publish
			// our block. If our private chainstate is behind the new chainstate, we adopt the public
			// chainstate into our private chainstate. If our private chainstate is ahead by a block, we
			// publish our chainstate at the public chainstate's height.

			// append new block to public chain
			this.h = msg.height;
			this.color = msg.color;
			this.revenue = jQuery.extend(true, {}, msg.revenue);
			this.history = jQuery.extend(true, [], msg.history);

			if (this.privatestack[0].h == this.h || this.privatestack[0].h == (this.h+1)) { // Is our private chainstate in close competition?
				node.parent.attackLog("publishing our private chain (H=" + this.privatestack[0].h + ") (public H=" + this.h + ")");
				// Publish our private chainstate, and reset the private chainstate.

				this.h = this.privatestack[0].h;
				this.color = this.privatestack[0].color;
				this.revenue = jQuery.extend(true, {}, this.privatestack[0].revenue);
				this.history = jQuery.extend(true, [], this.privatestack[0].history);

				this.privatestack = [{h:this.h,color:this.color,history:jQuery.extend(true, {}, this.history),revenue:jQuery.extend(true, [], this.revenue)}]
				node._broadcastStatus();
			} else if (this.privatestack[0].h < this.h) { // Is our private chain now behind the public chain?
				// Adopt the new public chain in our private chainstate.

				this.privatestack = [{h:this.h,color:this.color,history:jQuery.extend(true, {}, this.history),revenue:jQuery.extend(true, [], this.revenue)}]
				node.parent.attackLog("adopting public chain H=" + this.h);
			} else {
				// We're ahead, let's pop from the privatestack until we reach above the height of the public chain.

				var publish = false;
				while (true) {
					var cursor = this.privatestack.pop()
					if (cursor.h > (this.h+1)) {
						this.privatestack.push(cursor)
						break;
					}

					publish = cursor;
				}

				if (publish != false) {
					// We need to publish this chainstate.

					this.h = publish.h;
					this.color = publish.color;
					this.revenue = jQuery.extend(true, {}, publish.revenue);
					this.history = jQuery.extend(true, [], publish.history);
					
					node.parent.attackLog("publishing partial private chain H=" + this.h);

					node._broadcastStatus();
				}
			}
		} else {
			this.h = msg.height;
			this.color = msg.color;
			this.revenue = jQuery.extend(true, {}, msg.revenue); // is cloning really this retarded in js?
			this.history = jQuery.extend(true, [], msg.history); // is cloning really this retarded in js?

			this.privatestack = [{h:msg.height,color:msg.color,history:jQuery.extend(true, [], msg.history),revenue:jQuery.extend(true, {}, msg.revenue)}]
			node._broadcastStatus();
		}
	}

	this.mined = function() {
		if (node.attackmode == true) {
			// if we're in attack mode, we're always mining on our private chain
			var last = jQuery.extend(true, {}, this.privatestack[0]);
			last.h+=1;
			last.color = node.parent.rcolor();
			last.revenue = jQuery.extend(true, {}, last.revenue);
			if (typeof last.revenue[node.id] == "undefined") {
				last.revenue[node.id] = 0;
			}
			last.revenue[node.id]+=1;
			last.history = jQuery.extend(true, [], last.history);
			last.history.unshift(guid())

			node.parent.newBlock(node, last.h, last.revenue, last.color, node.attackmode, last.history); // log our new block

			this.privatestack.unshift(last); // add to the top of our private chain
			node.parent.attackLog("mined a new block on private chain (height=" + last.h + ") lead=" + (this.privatestack.length-1));

			node.parent.attackerSuccess(last.revenue[node.id] , last.h)
		} else {
			// we're an "honest" miner
			this.h+=1;
			this.color = node.parent.rcolor();
			if (typeof this.revenue[node.id] == "undefined") {
				this.revenue[node.id] = 0
			}
			this.revenue[node.id]+=1;
			this.history.unshift(guid())

			node.parent.newBlock(node, this.h, this.revenue, this.color, node.attackmode, this.history);
			node._broadcastStatus();
		}
	}
};