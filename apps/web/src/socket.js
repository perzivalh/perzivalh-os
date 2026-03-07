import { io } from "socket.io-client";
import { API_BASE } from "./apiBase";

export function connectSocket(token) {
  return io(API_BASE, {
    auth: { token },
    transports: ["websocket"],
  });
}
