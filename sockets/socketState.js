// 共用的狀態物件
const socketState = {
  isCanvasGenerating: false,
};

function getSocketState() {
  return socketState;
}

function setSocketState(key, value) {
  socketState[key] = value;
}

module.exports = {
  getSocketState,
  setSocketState,
};
