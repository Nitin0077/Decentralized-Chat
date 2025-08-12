import { Routes } from '@angular/router';
import { Home } from './home/home';
import { Chat } from './chat/chat';
import { About } from './about/about';
import { Features } from './features/features';

export const routes: Routes = [

    {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full'
    },
    {
        path: 'home',
        component:Home
    },
    {
        path: 'chat',
        component:Chat
    },
    {
        path:'about',
        component:About
    },
    {
        path:'feature',
        component:Features
    }
];
