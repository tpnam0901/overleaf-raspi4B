/* eslint-disable
    camelcase,
    no-dupe-keys,
    no-undef,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let DocManager
const MongoManager = require('./MongoManager')
const Errors = require('./Errors')
const logger = require('@overleaf/logger')
const _ = require('underscore')
const DocArchive = require('./DocArchiveManager')
const RangeManager = require('./RangeManager')
const Settings = require('@overleaf/settings')

module.exports = DocManager = {
  // TODO: For historical reasons, the doc version is currently stored in the docOps
  // collection (which is all that this collection contains). In future, we should
  // migrate this version property to be part of the docs collection, to guarantee
  // consitency between lines and version when writing/reading, and for a simpler schema.
  _getDoc(project_id, doc_id, filter, callback) {
    if (filter == null) {
      filter = {}
    }
    if (callback == null) {
      callback = function () {}
    }
    if (filter.inS3 !== true) {
      return callback(new Error('must include inS3 when getting doc'))
    }

    return MongoManager.findDoc(
      project_id,
      doc_id,
      filter,
      function (err, doc) {
        if (err != null) {
          return callback(err)
        } else if (doc == null) {
          return callback(
            new Errors.NotFoundError(
              `No such doc: ${doc_id} in project ${project_id}`
            )
          )
        } else if (doc != null ? doc.inS3 : undefined) {
          return DocArchive.unarchiveDoc(project_id, doc_id, function (err) {
            if (err != null) {
              logger.err({ err, project_id, doc_id }, 'error unarchiving doc')
              return callback(err)
            }
            return DocManager._getDoc(project_id, doc_id, filter, callback)
          })
        } else {
          if (filter.version) {
            return MongoManager.getDocVersion(
              doc_id,
              function (error, version) {
                if (error != null) {
                  return callback(error)
                }
                doc.version = version
                return callback(err, doc)
              }
            )
          } else {
            return callback(err, doc)
          }
        }
      }
    )
  },

  isDocDeleted(projectId, docId, callback) {
    MongoManager.findDoc(
      projectId,
      docId,
      { deleted: true },
      function (err, doc) {
        if (err) {
          return callback(err)
        }
        if (!doc) {
          return callback(
            new Errors.NotFoundError(
              `No such project/doc: ${projectId}/${docId}`
            )
          )
        }
        // `doc.deleted` is `undefined` for non deleted docs
        callback(null, Boolean(doc.deleted))
      }
    )
  },

  getFullDoc(project_id, doc_id, callback) {
    if (callback == null) {
      callback = function () {}
    }
    return DocManager._getDoc(
      project_id,
      doc_id,
      {
        lines: true,
        rev: true,
        deleted: true,
        version: true,
        ranges: true,
        inS3: true,
      },
      function (err, doc) {
        if (err != null) {
          return callback(err)
        }
        return callback(err, doc)
      }
    )
  },

  // returns the doc without any version information
  _peekRawDoc(project_id, doc_id, callback) {
    MongoManager.findDoc(
      project_id,
      doc_id,
      {
        lines: true,
        rev: true,
        deleted: true,
        version: true,
        ranges: true,
        inS3: true,
      },
      (err, doc) => {
        if (err) return callback(err)
        if (doc == null) {
          return callback(
            new Errors.NotFoundError(
              `No such doc: ${doc_id} in project ${project_id}`
            )
          )
        }
        if (doc && !doc.inS3) {
          return callback(null, doc)
        }
        // skip the unarchiving to mongo when getting a doc
        DocArchive.getDoc(project_id, doc_id, function (err, archivedDoc) {
          if (err != null) {
            logger.err(
              { err, project_id, doc_id },
              'error getting doc from archive'
            )
            return callback(err)
          }
          doc = _.extend(doc, archivedDoc)
          callback(null, doc)
        })
      }
    )
  },

  // get the doc from mongo if possible, or from the persistent store otherwise,
  // without unarchiving it (avoids unnecessary writes to mongo)
  peekDoc(project_id, doc_id, callback) {
    DocManager._peekRawDoc(project_id, doc_id, (err, doc) => {
      if (err) {
        return callback(err)
      }
      MongoManager.withRevCheck(
        doc,
        MongoManager.getDocVersion,
        function (error, version) {
          // If the doc has been modified while we were retrieving it, we
          // will get a DocModified error
          if (error != null) {
            return callback(error)
          }
          doc.version = version
          return callback(err, doc)
        }
      )
    })
  },

  getDocLines(project_id, doc_id, callback) {
    if (callback == null) {
      callback = function () {}
    }
    return DocManager._getDoc(
      project_id,
      doc_id,
      { lines: true, inS3: true },
      function (err, doc) {
        if (err != null) {
          return callback(err)
        }
        return callback(err, doc)
      }
    )
  },

  getAllDeletedDocs(project_id, filter, callback) {
    MongoManager.getProjectsDeletedDocs(project_id, filter, callback)
  },

  getAllNonDeletedDocs(project_id, filter, callback) {
    if (callback == null) {
      callback = function () {}
    }
    return DocArchive.unArchiveAllDocs(project_id, function (error) {
      if (error != null) {
        return callback(error)
      }
      return MongoManager.getProjectsDocs(
        project_id,
        { include_deleted: false },
        filter,
        function (error, docs) {
          if (typeof err !== 'undefined' && err !== null) {
            return callback(error)
          } else if (docs == null) {
            return callback(
              new Errors.NotFoundError(`No docs for project ${project_id}`)
            )
          } else {
            return callback(null, docs)
          }
        }
      )
    })
  },

  updateDoc(project_id, doc_id, lines, version, ranges, callback) {
    if (callback == null) {
      callback = function () {}
    }
    if (lines == null || version == null || ranges == null) {
      return callback(new Error('no lines, version or ranges provided'))
    }

    return DocManager._getDoc(
      project_id,
      doc_id,
      {
        version: true,
        rev: true,
        lines: true,
        version: true,
        ranges: true,
        inS3: true,
      },
      function (err, doc) {
        let updateLines, updateRanges, updateVersion
        if (err != null && !(err instanceof Errors.NotFoundError)) {
          logger.err(
            { project_id, doc_id, err },
            'error getting document for update'
          )
          return callback(err)
        }

        ranges = RangeManager.jsonRangesToMongo(ranges)

        if (doc == null) {
          // If the document doesn't exist, we'll make sure to create/update all parts of it.
          updateLines = true
          updateVersion = true
          updateRanges = true
        } else {
          updateLines = !_.isEqual(doc.lines, lines)
          updateVersion = doc.version !== version
          updateRanges = RangeManager.shouldUpdateRanges(doc.ranges, ranges)
        }

        let modified = false
        let rev = (doc != null ? doc.rev : undefined) || 0

        const updateLinesAndRangesIfNeeded = function (cb) {
          if (updateLines || updateRanges) {
            const update = {}
            if (updateLines) {
              update.lines = lines
            }
            if (updateRanges) {
              update.ranges = ranges
            }
            logger.debug(
              { project_id, doc_id },
              'updating doc lines and ranges'
            )

            modified = true
            rev += 1 // rev will be incremented in mongo by MongoManager.upsertIntoDocCollection
            return MongoManager.upsertIntoDocCollection(
              project_id,
              doc_id,
              update,
              cb
            )
          } else {
            logger.debug(
              { project_id, doc_id },
              'doc lines have not changed - not updating'
            )
            return cb()
          }
        }

        const updateVersionIfNeeded = function (cb) {
          if (updateVersion) {
            logger.debug(
              {
                project_id,
                doc_id,
                oldVersion: doc != null ? doc.version : undefined,
                newVersion: version,
              },
              'updating doc version'
            )
            modified = true
            return MongoManager.setDocVersion(doc_id, version, cb)
          } else {
            logger.debug(
              { project_id, doc_id, version },
              'doc version has not changed - not updating'
            )
            return cb()
          }
        }

        return updateLinesAndRangesIfNeeded(function (error) {
          if (error != null) {
            return callback(error)
          }
          return updateVersionIfNeeded(function (error) {
            if (error != null) {
              return callback(error)
            }
            return callback(null, modified, rev)
          })
        })
      }
    )
  },

  patchDoc(project_id, doc_id, meta, callback) {
    const projection = { _id: 1, deleted: true }
    MongoManager.findDoc(project_id, doc_id, projection, (error, doc) => {
      if (error != null) {
        return callback(error)
      }
      if (!doc) {
        return callback(
          new Errors.NotFoundError(
            `No such project/doc to delete: ${project_id}/${doc_id}`
          )
        )
      }

      if (meta.deleted && Settings.docstore.archiveOnSoftDelete) {
        // The user will not read this doc anytime soon. Flush it out of mongo.
        DocArchive.archiveDocById(project_id, doc_id, err => {
          if (err) {
            logger.warn(
              { project_id, doc_id, err },
              'archiving a single doc in the background failed'
            )
          }
        })
      }

      MongoManager.patchDoc(project_id, doc_id, meta, callback)
    })
  },
}
