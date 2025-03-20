import { StatusBarAlignment, ConfigurationTarget, workspace } from "vscode";
import { Profile } from "./models";
import * as util from "./util";
import { Logger } from "./util/logger";

export function getVscProfiles(): Profile[] {
  const profiles = workspace.getConfiguration("gitConfigUser").get<Profile[]>("profiles");

  if (profiles) {
    return profiles.map((x) => {
      return {
        label: util.trimLabelIcons(x.label),
        userName: x.userName,
        email: x.email,
        selected: x.selected,
        detail: undefined,
      };
    });
  }
  return [];
}

export async function saveVscProfile(profile: Profile, oldProfileLabel?: string): Promise<void> {
  //get existing profiles
  const profiles = getVscProfiles();
  profile = util.trimProperties(profile);
  let existingProfileIndex = -1;
  if (oldProfileLabel) {
    existingProfileIndex = profiles.findIndex((x) => x.label.toLowerCase() === oldProfileLabel.toLowerCase());
  } else {
    existingProfileIndex = profiles.findIndex((x) => x.label.toLowerCase() === profile.label.toLowerCase());
  }
  if (existingProfileIndex > -1) {
    profiles[existingProfileIndex] = profile;
  } else {
    profiles.push(profile);
  }
  await workspace.getConfiguration("gitConfigUser").update("profiles", profiles, ConfigurationTarget.Global);
  await workspace.getConfiguration("gitConfigUser").update("selectedProfile", profile.label, ConfigurationTarget.Workspace);
}

export function getVscProfile(profileName: string | undefined): Profile | undefined {
  if(profileName){
    const filtered = getVscProfiles().filter((x) => x.label.toLowerCase() === profileName.toLowerCase());
    if (filtered && filtered.length > 0) {
      return Object.assign({}, filtered[0]);
    }
  }
  return undefined;
}

export function getVscSelectedProfile(): Profile | undefined {
  const profileName = workspace.getConfiguration("gitConfigUser").get<string>("selectedProfile");
  // Logger.instance.logInfo(`selectedProfile: ${profileName}`);
  return profileName ? getVscProfile(profileName) : undefined;
}

export function getVscSelectedProfileLabel(): string | undefined {
  const profileName = workspace.getConfiguration("gitConfigUser").get<string>("selectedProfile");
  return profileName ? profileName : undefined;
}

export function getStatusBarLocation(): StatusBarAlignment{
  let location = workspace.getConfiguration("gitConfigUser").get<string>("statusBarLocation") || "right";
   return location == 'left'? StatusBarAlignment.Left: StatusBarAlignment.Right;
}