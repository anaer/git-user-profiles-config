import { window, commands } from "vscode";
import { getProfiles, saveProfile, getProfile } from "./config";
import { Profile } from "./Profile";
import { Commands } from "./constants";
import { Action } from "./Action";
import { access } from "fs";

export async function setUserProfile() {
    let profileName = await window.showInputBox({
        prompt: "Enter name for the profile",
        placeHolder: "Work",
        ignoreFocusOut: true,
        validateInput: input => {
            if (input && input.trim().length === 0) {
                return "Please enter a valid string";
            }
            return undefined;
        },
    });

    if (!profileName) {
        return null;
    }

    let userName = await window.showInputBox({
        prompt: `Enter user name for '${profileName}'`,
        placeHolder: "John Smith",
        ignoreFocusOut: true,
        validateInput: input => {
            if (input && input.trim().length === 0) {
                return "Please enter a valid string";
            }
            return undefined;
        },
    });

    if (!userName) {
        return null;
    }

    let email = await window.showInputBox({
        prompt: `Enter email for '${profileName}'`,
        placeHolder: "john.smith@work.com",
        ignoreFocusOut: true,
        validateInput: input => {
            let validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!validEmail.test(input)) {
                return "Oops! That does not seem to be a valid email. Please verify";
            }
            return undefined;
        },
    });

    if (!email) {
        return null;
    }

    let profile: Profile = {
        label: profileName,
        email: email,
        userName: userName,
        selected: false,
    };

    saveProfile(profile);
}

export async function getUserProfile(
    fromStatusBar: boolean = false
): Promise<{
    profile: Profile;
    action: Action;
}> {
    let profilesInConfig = getProfiles();
    let emptyProfile = <Profile>{
        label: "No profile",
        selected: false,
        userName: "NA",
        email: "NA",
    };

    if (profilesInConfig.length === 0) {
        //if profile loaded automatically and no config found
        //OR if no config found and user clicks on "no profile" on status bar, send undefined to show picklist
        if (fromStatusBar) {
            return {
                profile: emptyProfile,
                action: Action.ShowCreateConfig,
            };
        }
        return {
            profile: emptyProfile,
            action: Action.Silent,
        };
    }

    let selectedProfileFromConfig = profilesInConfig.filter(x => x.selected) || [];

    if (selectedProfileFromConfig.length === 0 && !fromStatusBar) {
        //if configs found, but none are selected, if from statusbar show picklist else silent
        return {
            profile: emptyProfile,
            action: Action.Silent,
        };
    }
    if (selectedProfileFromConfig.length > 0 && !fromStatusBar) {
        //if multiple items have selected = true (due fo manual change) return the first one
        return {
            profile: selectedProfileFromConfig[0],
            action: Action.PickFirstSelected,
        };
    }
    //show picklist only if no profile is marked as selected in config.
    //this can happen only when setting up config for the first time or user deliberately changed config
    let quickPickResponse = await window.showQuickPick<Profile>(profilesInConfig, {
        canPickMany: false,
        matchOnDetail: true,
        ignoreFocusOut: true,
        placeHolder: "Select a user profile. ",
    });

    if (quickPickResponse) {
        if (quickPickResponse.selected) {
            // if the profile already has selected = true, don't save again
            return {
                profile: quickPickResponse,
                action: Action.FromPicklist,
            };
        } else if (!quickPickResponse.selected) {
            //update the selected profile as selected and save to the config
            quickPickResponse.selected = true;
            saveProfile(Object.assign({}, quickPickResponse));
            return {
                profile: quickPickResponse,
                action: Action.FromPicklist,
            };
        }
    } else {
        // profile is already set in the statusbar,
        // user clicks statusbar, picklist is shown to switch profiles, but user does not pick anything
        // leave selected as is
        if (selectedProfileFromConfig.length > 0 && fromStatusBar) {
            return {
                profile: selectedProfileFromConfig[0],
                action: Action.Silent,
            };
        }
    }

    return {
        profile: emptyProfile,
        action: Action.ShowPicklist,
    };
}
