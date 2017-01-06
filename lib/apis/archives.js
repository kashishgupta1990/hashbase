const {DAT_KEY_REGEX, NotFoundError, UnauthorizedError, ForbiddenError, NotImplementedError} = require('../const')

// exported api
// =

module.exports = class ArchivesAPI {
  constructor (cloud) {
    this.config = cloud.config
    this.usersDB = cloud.usersDB
    this.archivesDB = cloud.archivesDB
    this.archiver = cloud.archiver
  }

  // common validation for add/remove
  async _validateAndGetKey (req, res) {
    // validate & sanitize input
    req.checkBody('key').optional().isDatHash()
    req.checkBody('url').optional().isDatURL()
    req.checkBody('name').optional().isAlphanumeric()
    ;(await req.getValidationResult()).throw()
    if (req.body.url) req.sanitizeBody('url').toDatDomain()
    var { key, url } = req.body

    // only allow one or the other
    if ((!key && !url) || (key && url)) {
      res.status(422).json({
        message: 'Must provide a key or url',
        invalidInputs: true
      })
      return false
    }

    // extract the key from the url
    if (url) {
      key = DAT_KEY_REGEX.exec(url)[1]
    }

    return key
  }

  async add (req, res) {
    // validate session
    if (!req.session) throw new UnauthorizedError()
    if (!req.session.scopes.includes('user')) throw new ForbiddenError()

    // get params
    var key = await this._validateAndGetKey(req, res)
    if (!key) return
    var name = (typeof req.body.name !== 'undefined') ? ('' + req.body.name) : undefined

    // update the records
    await Promise.all([
      this.usersDB.addArchive(req.session.id, key, name),
      this.archivesDB.addHostingUser(key, req.session.id)
    ])

    // add to the swarm
    await this.archiver.add(key)

    // respond
    res.status(200).end()
  }

  async remove (req, res) {
    // validate session
    if (!req.session) throw new UnauthorizedError()
    if (!req.session.scopes.includes('user')) throw new ForbiddenError()

    // get key param
    var key = await this._validateAndGetKey(req, res)
    if (!key) return

    // update the records
    await Promise.all([
      this.usersDB.removeArchive(req.session.id, key),
      this.archivesDB.removeHostingUser(key, req.session.id)
    ])

    // remove from the swarm
    await this.archiver.remove(key)

    // respond
    res.status(200).end()
  }

  async get (req, res) {
    if (req.query.view === 'status') {
      return this.archiveStatus(req, res)
    }

    // give info about the archive
    // TODO
    // cloud.dat.httpRequest(req, res)
    throw NotImplementedError()
  }

  async getByName (req, res) {
    // validate & sanitize input
    req.checkParams('username').isAlphanumeric().isLength({ min: 3, max: 16 })
    req.checkParams('datname').isAlphanumeric().isLength({ min: 3, max: 64 })
    ;(await req.getValidationResult()).throw()
    var { username, datname } = req.params

    // lookup user
    var userRecord = await this.usersDB.getByUsername(username)
    if (!userRecord) throw new NotFoundError()

    // lookup archive
    const findFn = (DAT_KEY_REGEX.test(datname))
      ? a => a.key === datname
      : a => a.name === datname
    var archive = userRecord.archives.find(findFn)
    if (!archive) throw new NotFoundError()

    // respond
    res.status(200).json({
      user: username,
      key: archive.key,
      name: archive.name,
      title: null, // TODO
      description: null // TODO
    })
  }

  async archiveStatus (req, res) {
    var key = req.path.slice(1)

    // start a timeout
    var didTimeout = false
    let to = setTimeout(() => {
      didTimeout = true
      if (res.headersSent) {
        return console.error('Headers already sent on timeout response for', key)
      }
      res.status(504).json({
        message: 'Timed out while searching for the archive',
        timedOut: true
      })
    }, 5e3)

    // fetch the feeds
    var [meta, content] = await this.archiver.get(Buffer.from(key, 'hex'))
    try {
      if (didTimeout) return

      // some data missing, report progress at zero
      if (!meta || !meta.blocks || !content || !content.blocks) {
        return res.status(200).json({ progress: 0 })
      }

      // calculate & respond
      var need = meta.blocks + content.blocks
      var remaining = meta.blocksRemaining() + content.blocksRemaining()
      res.status(200).json({ progress: (need - remaining) / need })
    } finally {
      clearTimeout(to)
      // TODO do we need to close? This seems to cause problems with replication
      // if (meta) meta.close()
      // if (content) content.close()
    }
  }
}