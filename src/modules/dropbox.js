(function(hello) {

	hello.init({

		dropbox: {

			name: 'Dropbox',

			oauth: {
				version: '1.0',
				auth: 'https://www.dropbox.com/1/oauth/authorize',
				request: 'https://api.dropbox.com/1/oauth/request_token',
				token: 'https://api.dropbox.com/1/oauth/access_token'
			},

			login: function(p) {
				// The dropbox login window is a different size
				p.options.popup.width = 1000;
				p.options.popup.height = 1000;
			},

			/*
				Dropbox does not allow insecure HTTP URI's in the redirect_uri field
				...otherwise I'd love to use OAuth2

				Follow request https://forums.dropbox.com/topic.php?id=106505

				p.qs.response_type = 'code';
				oauth: {
					version: 2,
					auth: 'https://www.dropbox.com/1/oauth2/authorize',
					grant: 'https://api.dropbox.com/1/oauth2/token'
				}
			*/

			// API Base URL
			base: 'https://api.dropbox.com/1/',

			// Bespoke setting: this is states whether to use the custom environment of Dropbox or to use their own environment
			// Because it's notoriously difficult for Dropbox too provide access from other webservices, this defaults to Sandbox
			root: 'sandbox',

			// Map GET requests
			get: {
				me: 'account/info',

				// Https://www.dropbox.com/developers/core/docs#metadata
				'me/files': req('metadata/@{root|sandbox}/@{parent}'),
				'me/folder': req('metadata/@{root|sandbox}/@{id}'),
				'me/folders': req('metadata/@{root|sandbox}/'),

				'default': function(p, callback) {
					if (p.path.match('https://api-content.dropbox.com/1/files/')) {
						// This is a file, return binary data
						p.method = 'blob';
					}

					callback(p.path);
				}
			},

			post: {
				'me/files': function(p, callback) {

					var path = p.data.parent;
					var fileName = p.data.name;

					p.data = {
						file: p.data.file
					};

					// Does this have a data-uri to upload as a file?
					if (typeof (p.data.file) === 'string') {
						p.data.file = hello.utils.toBlob(p.data.file);
					}

					callback('https://api-content.dropbox.com/1/files_put/@{root|sandbox}/' + path + '/' + fileName);
				},

				'me/folders': function(p, callback) {

					var name = p.data.name;
					p.data = {};

					callback('fileops/create_folder?root=@{root|sandbox}&' + hello.utils.param({
						path: name
					}));
				}
			},

			// Map DELETE requests
			del: {
				'me/files': 'fileops/delete?root=@{root|sandbox}&path=@{id}',
				'me/folder': 'fileops/delete?root=@{root|sandbox}&path=@{id}'
			},

			wrap: {
				me: function(o) {
					formatError(o);
					if (!o.uid) {
						return o;
					}

					o.name = o.display_name;
					var m = o.name.split(' ');
					o.first_name = m.shift();
					o.last_name = m.join(' ');
					o.id = o.uid;
					delete o.uid;
					delete o.display_name;
					return o;
				},

				'default': function(o, headers, req) {
					formatError(o);
					if (o.is_dir && o.contents) {
						o.data = o.contents;
						delete o.contents;

						o.data.forEach(function(item) {
							item.root = o.root;
							formatFile(item, headers, req);
						});
					}

					formatFile(o, headers, req);

					if (o.is_deleted) {
						o.success = true;
					}

					return o;
				}
			},

			// Doesn't return the CORS headers
			xhr: function(p) {

				// The proxy supports allow-cross-origin-resource
				// Alas that's the only thing we're using.
				if (p.data && p.data.file) {
					var file = p.data.file;
					if (file) {
						if (file.files) {
							p.data = file.files[0];
						}
						else {
							p.data = file;
						}
					}
				}

				if (p.method === 'delete') {
					p.method = 'post';
				}

				return true;
			},

			form: function(p, qs) {
				delete qs.state;
				delete qs.redirect_uri;
			}
		}
	});

	function formatError(o) {
		if (o && 'error' in o) {
			o.error = {
				code: 'server_error',
				message: o.error.message || o.error
			};
		}
	}

	function formatFile(o, headers, req) {

		if (typeof o !== 'object' ||
			(typeof Blob !== 'undefined' && o instanceof Blob) ||
			(typeof ArrayBuffer !== 'undefined' && o instanceof ArrayBuffer)) {
			// This is a file, let it through unformatted
			return;
		}

		if ('error' in o) {
			return;
		}

		var path = o.root + o.path.replace(/\&/g, '%26');
		if (o.thumb_exists) {
			o.thumbnail = hello.settings.oauth_proxy + '?path=' +
			encodeURIComponent('https://api-content.dropbox.com/1/thumbnails/' + path + '?format=jpeg&size=m') + '&access_token=' + req.query.access_token;
		}

		o.type = (o.is_dir ? 'folder' : o.mime_type);
		o.name = o.path.replace(/.*\//g, '');
		if (o.is_dir) {
			o.files = 'metadata/' + path;
		}
		else {
			o.downloadLink = hello.settings.oauth_proxy + '?path=' +
			encodeURIComponent('https://api-content.dropbox.com/1/files/' + path) + '&access_token=' + req.query.access_token;
			o.file = 'https://api-content.dropbox.com/1/files/' + path;
		}

		if (!o.id) {
			o.id = o.path.replace(/^\//, '');
		}

		// O.media = 'https://api-content.dropbox.com/1/files/' + path;
	}

	function req(str) {
		return function(p, cb) {
			delete p.query.limit;
			cb(str);
		};
	}

})(hello);
