import { ConfigurationTarget, workspace } from "vscode";
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
    // set existing to false if user is making a selection of profile (not updating the profile)s
    profiles.forEach((x) => {
      x.selected = false;
      x.label = x.label.replace("$(check)", "").trim();
    });

    profiles[existingProfileIndex] = profile;
  } else {
    profiles.push(profile);
  }
  await workspace.getConfiguration("gitConfigUser").update("profiles", profiles, ConfigurationTarget.Global);
  await workspace.getConfiguration("gitConfigUser").update("selectedProfile", profile.label, ConfigurationTarget.Workspace);
}

export function getVscProfile(profileName: string): Profile | undefined {
  const filtered = getVscProfiles().filter((x) => x.label.toLowerCase() === profileName.toLowerCase());
  if (filtered && filtered.length > 0) {
    return Object.assign({}, filtered[0]);
  }
  return undefined;
}

export function getVscSelectedProfiles(): Profile | undefined {
  const profileName = workspace.getConfiguration("gitConfigUser").get<string>("selectedProfile");
  // Logger.instance.logInfo(`selectedProfile: ${profileName}`);
  return getVscProfile(profileName);
}
