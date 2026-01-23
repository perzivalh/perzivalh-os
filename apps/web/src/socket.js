import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";

export function connectSocket(token) {
  return io(API_BASE, {
    auth: { token },
  });
}
