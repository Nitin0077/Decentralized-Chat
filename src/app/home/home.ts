import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';


@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home {
 constructor(private router: Router) {}
  header="Decentralized Chat App";
  goToRandom() {
    this.router.navigate(['/chat'], { queryParams: { mode: 'random' } });
    this.header = "Random Chat";
  }

  goToGroup() {
    this.router.navigate(['/chat'], { queryParams: { mode: 'group' } });
    this.header = "Group Chat";
  }
}