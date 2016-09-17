'use strict';

/* eslint id-length: ["off"], newline-per-chained-call: ["off"] */

const Pg = require('pg');
const URL = require('url');
const ShareDBDB = require('sharedb').DB;

Pg.on('end', onPgEnd);

const pgPool = new Pg.Pool(parseDatabaseURL());

class ShareDBPGCanvas extends ShareDBDB {
  commit(orgID, canvasID, op, snapshot, options, cb) {
    return pgPool.connect().then(client => {
      return client.query('BEGIN').then(_ => {
        return this.doGetSnapshot(client, orgID, canvasID, [], options)
          .then(existingSnap => {
            if (snapshot.v !== existingSnap.v + 1) return false;
            return this.doCommit(client, canvasID, op, snapshot);
          }).then(success => {
            return client.query('COMMIT').then(_ => {
              return resolveQuery(success, cb, client);
            });
          }).catch(err => {
            return this.rollbackClient(client, err, cb);
          });
      }).catch(err => rejectQuery(err, cb, client));
    }).catch(rejectError(cb));
  }

  doCommit(client, canvasID, op, snapshot) {
    return this.insertOps(client, canvasID, op).then(_ => {
      return this.updateCanvas(client, canvasID, snapshot);
    }).then(_ => true);
  }

  getOps(orgID, canvasID, from, to, options, cb) {
    let query = 'SELECT * FROM ops WHERE canvas_id = $1 AND version >= $2';
    let args = [canvasID, from];

    if (to !== null) {
      query = `${query} AND version < $3`;
      args = args.concat(to);
    }

    return pgPool.connect().then(client => {
      return this.doGetSnapshot(client, orgID, canvasID, [], options)
        .then(_ => {
          return client.query(query, args);
        }).then(({ rows }) => {
          return resolveQuery(castToOps(rows), cb, client);
        }).catch(err => {
          rejectQuery(err, cb, client);
        });
    }).catch(rejectError(cb));
  }

  getSnapshot(orgID, canvasID, fields, options, cb) {
    options = options || {};

    return pgPool.connect().then(client => {
      return this.doGetSnapshot(client, ...arguments);
    }).catch(rejectError(cb));
  }

  doGetSnapshot(client, orgID, canvasID, fields, options, cb) {
    return client.query(
      'SELECT * FROM canvases WHERE id = $1 AND team_id = $2 LIMIT 1 FOR UPDATE',
      [canvasID, orgID]
    ).then(({ rows }) => {
      return resolveQuery(castToSnapshot(rows[0] || {}), cb, client);
    }).catch(err => {
      rejectQuery(err, cb, client);
    });
  }

  insertOps(client, canvasID, op) {
    return client.query(`
      INSERT INTO ops(canvas_id, components, source, seq, version, meta,
                      inserted_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (canvas_id, version) DO NOTHING
        RETURNING *`,
      [canvasID, JSON.stringify(op.op), op.src, op.seq, op.v,
       op.meta || {}, new Date(op.m.ts), new Date(op.m.ts)]);
  }

  updateCanvas(client, canvasID, snapshot) {
    return client.query(`
      UPDATE canvases SET
        blocks = $1,
        version = $2,
        updated_at = $3
        WHERE id = $4`,
      [JSON.stringify(snapshot.data), snapshot.v,
       new Date(snapshot.m.mtime), canvasID]
    );
  }

  rollbackClient(client, err, cb) {
    return client.query('ROLLBACK').then(_ => {
      rejectQuery(err, cb, client);
    });
  }
}

module.exports = ShareDBPGCanvas;

function castToOp(row) {
  return {
    src: row.source,
    seq: row.seq,
    op: row.components,
    m: { ts: Number(row.inserted_at) },
    v: row.version
  };
}

function castToOps(rows) {
  return rows.map(castToOp);
}

function castToSnapshot(row) {
  let m = {};

  if (row.updated_at && row.inserted_at) {
    m = {
      mtime: Number(row.updated_at),
      ctime: Number(row.inserted_at)
    };
  }

  return {
    id: row.id,
    type: row.type,
    v: row.version,
    data: row.blocks,
    m
  };
}

function onPgEnd() {
  ShareDBPGCanvas.willClose = true;
}

function releaseClient(client) {
  if (typeof client.release === 'function') client.release();
}

function rejectError(cb) {
  return function _rejectError(err) {
    return doRejectError(err, cb);
  };
}

function doRejectError(err, cb) {
  if (cb) return cb(err);
  throw err;
}

function resolveQuery(result, cb, client) {
  releaseClient(client);
  if (cb) return cb(null, result);
  return result;
}

function rejectQuery(err, cb, client) {
  releaseClient(client);
  doRejectError(err, cb);
}

function parseDatabaseURL() {
  const params = URL.parse(process.env.DATABASE_URL);

  let user = null;
  let password = null;
  if (params.auth) {
    [user, password] = params.auth.split(':');
  }

  return {
    user,
    password,
    host: params.hostname,
    port: params.port,
    database: params.pathname ? params.pathname.split('/')[1] : null,
    ssl: process.env.NODE_ENV === 'production'
  };
}
