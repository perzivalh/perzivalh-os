let io = null;

function setSocketServer(server) {
  io = server;
}

function emitEvent(event, payload) {
  if (!io) {
    return;
  }
  io.emit(event, payload);
}

module.exports = {
  setSocketServer,
  emitEvent,
};
