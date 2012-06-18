var
	util = require('util'),
	request = require('request'),
	querystring = require('querystring'),
	// types of requests which shouldn't use 'id' as keys, in the user data object
	nonIdBasedConnection = [ 'permissions', 'picture', 'user' ],
	connections,
	toString = Object.prototype.toString,
	arraySlice = Array.prototype.slice,
	key

function api(clientId) {
	if (!clientId) {
		throw 'No client Id defined'
		return;
	}

	this.clientId = clientId

	return this
}

function connection(kind, path, universal) {
	// can be:
	// (id, accessToken, callback)
	// (id, accessToken, options, callback)
	return function connfunc(id, accessToken, a, b) {
		var
			lex = this,
			isUser = this instanceof User,
			isNonIdBased = ~nonIdBasedConnection.indexOf(kind),
			options, callback,
			pagingFunc

		// figuring out the positions of 'a' and 'b'
		// 'a' and 'b' are either options (a) and callback (b) or just callback (a)
		a = isUser ? arguments[0] : a,
		b = isUser ? arguments[1] : b 

		// figuring out the actual options and callback to be used
		options = a && toString.call(a) === '[object Object]' ? a : false,
		callback = typeof a === 'function' ? a : b

		// if this is a call from a User instance then we already have the id and acces token, which shouldn't be passed in
		if (this instanceof User) id = this.id, accessToken = this.accessToken, this.data[kind] = this.data[kind] || (isNonIdBased ? null : {})
	
		// break everything if what should be a function is, in fact, not quite a function
		if (typeof callback != 'function') throw 'No callback given for #' + kind + '()'
	
		request('https://api.instagram.com/v1/' + path.replace(/\{id\}/, id) + '?access_token=' + accessToken + (options === false ? '' : '&' + querystring.stringify(options)), function(err, res, body) {
			var 
				i, l, key,
				paging = {}

			// not sure if this try catch is needed
			try {
				body = JSON.parse(body)
			} catch(e) {}

			// if in a User instance then append the data
			if (isUser) {
				if (isNonIdBased) lex.data[kind] = typeof body == 'string' ? body : Array.isArray(body.data) ? body.data[0] : body.data ? body.data : body
				else if (Array.isArray(body.data)) for (i = 0, l = body.data.length; i < l; i++) lex.data[kind][body.data[i].id] = body.data[i]
			}

			// facebook may have given us 'next' and 'previous' paging paths
			if (body.paging) {
				pagingFunc = function(callback) {
					var pagingOptions = querystring.parse(body.paging[this].replace(preQueryString, ''))
					// they gave us the access token, which we have in the User instance
					delete pagingOptions.access_token
					connfunc.apply(lex, (isUser ? [ ] : [ id, accessToken ]).concat([ pagingOptions, callback ]))
				}

				for (key in body.paging) paging[key] = pagingFunc.bind(key)
			}

			callback(err, res, body, paging)
		})

		return this
	}
}

connections = {
	media: 'media/{id}',
	mediaSearch: 'media/search',
	mediaPopular: 'media/popular',
	userProfile: 'users/{id}',
	userFeed: 'users/{id}/feed',
	userMediaRecent: 'users/{id}/media/recent',
	userMediaLiked: 'users/{id}/media/liked',
	userSearch: 'users/search'
}
for (key in connections) api.prototype[key] = connection(key, connections[key])

function User(a, b) {
	if (arguments.length < 1) throw 'Users require an accessToken'

	this.id = arguments.length > 1 ? a : 'self', 
	this.accessToken = arguments.length > 1 ? b : a,
	this.data = {}

	return this
}

util.inherits(User, api)

// function to get multiple 'connections' asynchronously
User.prototype.get = function(toGet, a, b) {
	var 
		lex = this,
		i = 0, l = toGet.length, 
		finished = 0, 
		firstErr,
		getCallback = function(err) {
			if (err) firstErr = firstErr || err
			if (++finished === l) callback(firstErr, lex)
		}

	options = a && toString.call(a) === '[object Object]' ? a : false,
	callback = typeof a === 'function' ? a : b

	if (!Array.isArray(toGet) || toGet.length === 0) throw 'Must supply at least one connection to \'get\''
	if (typeof callback != 'function') throw 'No callback given for #get()'

	for (; i < l; i++) {
		// although we throw if trying to 'get' something that we haven't defined,
		// the previous requests will have still been sent out (but callback will not be reached)
		if (!~connections.indexOf(toGet[i])) throw toGet[i] + ' is not a valid \'connection\' type'

		this[toGet[i]].apply(lex, (options ? [ options ] : [ ]).concat([ getCallback ]))
	}
}

// can access User two ways
api.prototype.User = User
api.User = User

module.exports = api