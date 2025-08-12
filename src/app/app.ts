import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Chat } from "./chat/chat";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected title = 'Chat';
}
