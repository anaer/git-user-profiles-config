import { basename } from "path";
import { StatusBarAlignment, StatusBarItem, ThemeColor, window, workspace } from "vscode";
import * as Constants from "../constants";
import { Profile } from "../models";
import { getCurrentFolder, Logger } from "../util";

export class ProfileStatusBar {
  private static _instance: ProfileStatusBar;
  private static _statusBar: StatusBarItem;

  static get instance(): ProfileStatusBar {
    if (!ProfileStatusBar._instance) {
      ProfileStatusBar._instance = new ProfileStatusBar();
    }
    return ProfileStatusBar._instance;
  }

  private constructor() {
    const location = workspace.getConfiguration("gitConfigUser").get<string>("statusBarLocation");
    let align = location == 'left'? StatusBarAlignment.Left: StatusBarAlignment.Right;
    ProfileStatusBar._statusBar = window.createStatusBarItem(align, 1000000);
    Logger.instance.logInfo("Initializing status bar complete.");
  }

  public async updateStatus(status: Profile | undefined | string, usedInRepo = false) {
    const folderPath = await getCurrentFolder();
    let tooltip = `${Constants.Application.APPLICATION_NAME} - Click status bar icon for more options`;

    if (folderPath && (status as Profile).label) {
      const profile = status as Profile;
      ProfileStatusBar._statusBar.text = `$(repo) ${profile.label}`;
      if (profile.label !== Constants.Application.APPLICATION_NAME) {
        if (usedInRepo) {
          ProfileStatusBar._statusBar.text = `$(repo) ${basename(folderPath)} $(arrow-small-right) ${profile.label.replace("$(check)", "").trim()} $(check)`;
          ProfileStatusBar._statusBar.backgroundColor = new ThemeColor("statusBarItem.activeBackground");
          tooltip = `Profile: ${profile.userName} (${profile.email})\r\nClick status bar icon for more options`;
        } else {
          ProfileStatusBar._statusBar.text = `$(repo) ${basename(folderPath)} $(arrow-small-right) ${profile.label.replace("$(alert)", "").trim()} $(alert)`;
          ProfileStatusBar._statusBar.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
          tooltip = `Profile: ${profile.userName} (${profile.email})\r\nClick status bar icon for more options`;
        }
      }
    }
    ProfileStatusBar._statusBar.tooltip = tooltip;

    ProfileStatusBar._statusBar.show();
  }

  public attachCommand(commandId: string) {
    ProfileStatusBar._statusBar.command = commandId;
  }

  public get StatusBar(): StatusBarItem {
    return ProfileStatusBar._statusBar;
  }
}
