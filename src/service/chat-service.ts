import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private socket: Socket;
  private serverUrl = 'http://localhost:3000'; // Change this to ngrok URL when going online

  constructor() {
    this.socket = io(this.serverUrl);
  }

  register(username: string) {
    this.socket.emit('register', username);
  }

  sendPrivateMessage(to: string, from: string, msg: string) {
    this.socket.emit('private-message', { to, from, msg });
  }

  receivePrivateMessages(): Observable<any> {
    return new Observable(observer => {
      this.socket.on('private-message', (data) => {
        observer.next(data);
      });
    });
  }

  getOnlineUsers(): Observable<string[]> {
    return new Observable(observer => {
      this.socket.on('user-list', (userList: string[]) => {
        observer.next(userList);
      });
    });
  }
}
