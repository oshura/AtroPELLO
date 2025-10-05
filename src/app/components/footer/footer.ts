import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss'
})
export class Footer {
  currentYear = new Date().getFullYear();

  onCookiesClick() {
    console.log('Cookies policy clicked');
  }

  onContactClick() {
    console.log('Contact clicked');
  }

  onLegalClick() {
    console.log('Legal terms clicked');
  }
}
