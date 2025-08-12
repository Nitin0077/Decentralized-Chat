import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { Home } from './app/home/home';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
