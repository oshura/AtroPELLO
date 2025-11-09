import { Component } from '@angular/core';
import { LoggingService, LogCategory } from '../../services/logging.service';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss'
})
export class Footer {
  currentYear = new Date().getFullYear();
  constructor(private logger: LoggingService) {}

  onCookiesClick() { this.logger.debug(LogCategory.INPUT, 'Cookies policy clicked'); }
  onContactClick() { this.logger.debug(LogCategory.INPUT, 'Contact clicked'); }
  onLegalClick() { this.logger.debug(LogCategory.INPUT, 'Legal terms clicked'); }
}
