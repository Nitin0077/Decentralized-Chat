import { Component, OnInit, ViewChild, ElementRef, HostListener,AfterViewChecked } from '@angular/core';
import { CommonModule, NgIf } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { io } from 'socket.io-client';
import { LightboxModule } from 'ngx-lightbox';
import { ActivatedRoute } from '@angular/router';
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, CommonModule, LightboxModule,NgIf],
  templateUrl: './chat.html',
  styleUrl: './chat.css'
})
export class Chat implements OnInit {
  socket: any;
  username = '';
  avatar = '';
  message = '';
  groupId = '';
  messages: { sender: string; avatar?: string; text: string; type?: string }[] = [];
  selectedUser: any = null;
  onlineUsers: any[] = [];
  chatLog: { [key: string]: any[] } = {};
  typingText = '';
  usernameSet = false;
  lightboxImage: string | null = null;
  chatMode: 'random' | 'group' | 'none' = 'none';
  isWaiting: boolean = false;


    callBtn:boolean=true
  @ViewChild('fileInput') fileInput!: ElementRef;

  // WebRTC
  peerConnection: RTCPeerConnection | null = null;
  localStream: MediaStream | null = null;


  iceServers = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

  inCallWith = new Set<string>();

  callStatusMessage: string = '';




  @ViewChild('scrollMe') private messagesContainer!: ElementRef;

  ngAfterViewChecked() {
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    try {
      this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
    } catch (err) {
      console.warn('Auto-scroll failed', err);
    }
  }

  constructor(private route: ActivatedRoute) { }

  ngOnInit() {
    this.socket = io('http://localhost:3000');

    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }

    this.route.queryParams.subscribe(params => {
      const mode = params['mode'];
      const usernameParam = params['username'];
      const groupIdParam = params['groupId'];

      if (mode === 'random') {
        this.chatMode = 'random';
        this.startRandomChat();
      } else if (mode === 'group') {
        this.chatMode = 'group';
        if (usernameParam && groupIdParam) {
          this.username = usernameParam;
          this.groupId = groupIdParam;
          this.avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${this.username}`;
          this.usernameSet = true;

          this.socket.emit('join', {
            username: this.username,
            avatar: this.avatar,
            groupId: this.groupId
          });
        }
      } else {
        this.chatMode = 'none';
      }
    });

    this.setupSocketListeners();
  }

  @HostListener('document:keydown', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.chatMode === 'random') {
      this.disconnectRandomChat();
    }
  }

  disconnectRandomChat() {
    if (this.selectedUser) {
      this.socket.emit('leave', {
        from: this.username,
        to: this.selectedUser.username,
        groupId: this.groupId
      });

      this.selectedUser = null;
      this.isWaiting = true;

      setTimeout(() => {
        this.isWaiting = true;
        this.socket.emit('find-random-user', this.username);
      }, 100);
    }
  }

  findRandomPartner() {
    this.socket.emit('find partner', {
      username: this.username,
      groupId: this.groupId
    });
  }

  setupSocketListeners() {
    this.socket.on('onlineUsers', (users: any[]) => {
      this.onlineUsers = users.filter(u =>
        u.username !== this.username && u.groupId === this.groupId
      );
    });



    this.socket.on('voice-ended', (data: any) => {
      if (this.selectedUser?.username === data.from) {
        this.endVoiceCall();
        this.callStatusMessage = `Call with ${data.from} has ended.`; // message for UI
      }
    });


    this.socket.on('chat message', (msg: any) => {
      if (msg.from === this.username) return;

      const partner = msg.from;
      if (!this.chatLog[partner]) this.chatLog[partner] = [];

      if (msg.to === this.username && this.selectedUser?.username === msg.from) {
        msg.seen = true;
        this.socket.emit('message seen', { from: msg.from, to: msg.to, groupId: this.groupId });
      }

      this.chatLog[partner].push(msg);

      if (this.selectedUser?.username !== msg.from) {
        new Notification(`New message from ${msg.from}`, {
          body: msg.msg || msg.fileName
        });
      }
    });


    this.socket.on('typing', (from: string) => {
      if (this.selectedUser?.username === from) {
        this.typingText = `${from} is typing...`;
        setTimeout(() => this.typingText = '', 2000);
      }
    });

    this.socket.on('update seen', (data: any) => {
      const messages = this.chatLog[data.to];
      if (messages) {
        messages.forEach(m => {
          if (m.from === this.username) m.seen = true;
        });
      }
    });

    this.socket.on('voice-offer', (data: any) => {
      this.handleVoiceOffer(data.from, data.offer);
    });

    this.socket.on('voice-answer', (data: any) => {
      this.handleVoiceAnswer(data.answer);
    });

    this.socket.on('ice-candidate', (data: any) => {
      this.handleIceCandidate(data.candidate);
    });

  }

  setUsername() {
    if (this.username.trim() && this.groupId.trim()) {
      this.avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${this.username}`;
      this.usernameSet = true;

      this.socket.emit('join', {
        username: this.username,
        avatar: this.avatar,
        groupId: this.groupId
      });
    }
  }

  startRandomChat() {
    this.groupId = 'RANDOM-GROUP';
    this.username = 'User' + Math.floor(Math.random() * 1000);
    this.avatar = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${this.username}`;
    this.usernameSet = true;

    this.socket.emit('join', {
      username: this.username,
      avatar: this.avatar,
      groupId: this.groupId
    });
  }

  generateGroupId() {
    this.groupId = Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  selectUser(user: any) {
    this.selectedUser = user;
    if (!this.chatLog[user.username]) {
      this.chatLog[user.username] = [];
    }

    this.chatLog[user.username].forEach(msg => {
      if (msg.to === this.username && !msg.seen) {
        msg.seen = true;
        this.socket.emit('message seen', {
          from: user.username,
          to: this.username,
          groupId: this.groupId
        });
      }
    });
  }

  sendMessage() {
    if ((!this.message || !this.message.trim()) || !this.selectedUser) return;

    const msgObj: any = {
      from: this.username,
      to: this.selectedUser.username,
      groupId: this.groupId,
      msg: this.message.trim(),
      timestamp: new Date().toISOString(),
      seen: false
    };

    this.socket.emit('chat message', msgObj);

    if (!this.chatLog[this.selectedUser.username]) {
      this.chatLog[this.selectedUser.username] = [];
    }

    this.chatLog[this.selectedUser.username].push(msgObj);
    this.message = '';
  }

  onTyping() {
    if (this.selectedUser) {
      this.socket.emit('typing', {
        to: this.selectedUser.username,
        from: this.username,
        groupId: this.groupId
      });
    }
  }

  getLastMessage(user: any): string {
    const messages = this.chatLog[user.username];
    return messages?.length
      ? (messages[messages.length - 1].msg || messages[messages.length - 1].fileName)
      : '';
  }

  addEmoji(emoji: string) {
    this.message += emoji;
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file || !this.selectedUser) return;

    const formData = new FormData();
    formData.append('file', file);

    fetch('http://localhost:3000/upload', {
      method: 'POST',
      body: formData
    })
      .then(res => res.json())
      .then(data => {
        const msgObj: any = {
          from: this.username,
          to: this.selectedUser.username,
          groupId: this.groupId,
          msg: '',
          timestamp: new Date().toISOString(),
          seen: false,
          fileName: file.name,
          fileUrl: data.url
        };

        this.socket.emit('chat message', msgObj);

        if (!this.chatLog[this.selectedUser.username]) {
          this.chatLog[this.selectedUser.username] = [];
        }

        this.chatLog[this.selectedUser.username].push(msgObj);
      })
      .catch(err => {
        console.error('File upload error:', err);
        alert('File upload failed.');
      });
  }

  triggerFileUpload() {
    this.fileInput.nativeElement.click();
  }

  openLightbox(url: string) {
    this.lightboxImage = url;
  }

  closeLightbox() {
    this.lightboxImage = null;
  }

  isImage(fileName: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
  }

  // 🔊 VOICE CHAT METHODS
  async startVoiceCall() {
    if (!this.selectedUser) return;

    this.inCallWith.add(this.selectedUser.username); // ✅ Mark as in call

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.peerConnection = new RTCPeerConnection(this.iceServers);
    this.socket.emit('voice-started', { to: this.selectedUser?.username });

    this.localStream.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          to: this.selectedUser.username,
          from: this.username,
          candidate: event.candidate
        });
      }
    };

    this.peerConnection.ontrack = event => {
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play();
    };

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    this.socket.emit('voice-offer', {
      to: this.selectedUser.username,
      from: this.username,
      offer
    });
    this.callBtn = false; // Enable call button after starting the call
  }


  async handleVoiceOffer(from: string, offer: any) {
    this.selectedUser = { username: from };
    this.peerConnection = new RTCPeerConnection(this.iceServers);
    this.inCallWith.add(from);
    this.peerConnection.onicecandidate = event => {
      if (event.candidate) {
        this.socket.emit('ice-candidate', {
          to: from,
          from: this.username,
          candidate: event.candidate
        });
      }
    };

    this.peerConnection.ontrack = event => {
      const remoteAudio = new Audio();
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play();
    };

    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.localStream.getTracks().forEach(track => {
      this.peerConnection!.addTrack(track, this.localStream!);
    });

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.socket.emit('voice-answer', {
      to: from,
      from: this.username,
      answer
    });
  }



  handleVoiceAnswer(answer: any) {
    this.peerConnection!.setRemoteDescription(new RTCSessionDescription(answer));
  }

  handleIceCandidate(candidate: any) {
    this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
  }

  endVoiceCall() {
  this.peerConnection?.close();
  this.localStream?.getTracks().forEach(track => track.stop());
  this.peerConnection = null;
  this.localStream = null;

  if (this.selectedUser) {
    this.inCallWith.delete(this.selectedUser.username);

    // Push a "system" type message into chat log
    this.chatLog[this.selectedUser.username].push({
      msg: 'Call ended.',
      type: 'system',
      timestamp: new Date()
    });
  }

  this.callBtn!= this.callBtn; // Disable call button after ending the call
}





}
