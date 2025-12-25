import { Component, Inject } from '@angular/core';
import { LoggingService, LogCategory } from '../../services/logging.service';
import { VERSION_SETTINGS, VersionSettings, formatVersion } from '../../settings/version-settings';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.html',
  styleUrl: './footer.scss'
})
export class Footer {
  currentYear = new Date().getFullYear();
  readonly versionDisplay: string;

  constructor(
    private logger: LoggingService,
    @Inject(VERSION_SETTINGS) versionSettings: VersionSettings
  ) {
    this.versionDisplay = `TO3 v${formatVersion(versionSettings)}`;
  }

  onCookiesClick() { this.logger.debug(LogCategory.INPUT, 'Cookies policy clicked'); }
  onContactClick() { this.logger.debug(LogCategory.INPUT, 'Contact clicked'); }
  onLegalClick() { this.logger.debug(LogCategory.INPUT, 'Legal terms clicked'); }
  onThirdPartyLicensesClick() {
    this.logger.debug(LogCategory.INPUT, 'Third party licenses link clicked');
  }
}
