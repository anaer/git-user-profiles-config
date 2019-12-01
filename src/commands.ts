import { window, commands, workspace } from "vscode";
import { getProfiles, saveProfile, getProfile } from "./config";
import { Profile } from "./Profile";
import { Commands } from "./constants";
import { Action } from "./Action";
import { isValidWorkspace, validateProfileName, validateUserName, validateEmail } from "./utils";
import * as sgit from "simple-git/promise";
import { MultiStepInput, State } from "./multiStepInput";

export async function createUserProfile() {
    const state = {} as Partial<State>;
    await MultiStepInput.run(input => pickProfileName(input, state));

    let profile: Profile = {
        label: state.profileName || "",
        email: state.email || "",
        userName: state.userName || "",
        selected: false,
    };

    saveProfile(profile);
}

function shouldResume() {
    // Could show a notification with the option to resume.
    return new Promise<boolean>((resolve, reject) => {});
}

async function pickProfileName(input: MultiStepInput, state: Partial<State>, create: boolean = true) {
    state.profileName = await input.showInputBox({
        title: create ? "Create a profile" : "Edit profile",
        step: 1,
        totalSteps: 3,
        prompt: "Enter name for the profile",
        value: state.profileName || "",
        placeholder: "Work",
        validate: input => validateProfileName(input, create),
        shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => pickUserName(input, state, create);
}

async function pickUserName(input: MultiStepInput, state: Partial<State>, create: boolean = true) {
    state.userName = await input.showInputBox({
        title: create ? "Create a profile" : "Edit profile",
        step: 2,
        totalSteps: 3,
        prompt: "Enter the user name",
        value: state.userName || "",
        placeholder: "John Smith",
        validate: validateUserName,
        shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => pickEmail(input, state, create);
}

async function pickEmail(input: MultiStepInput, state: Partial<State>, create: boolean = true) {
    state.email = await input.showInputBox({
        title: create ? "Create a profile" : "Edit profile",
        step: 3,
        totalSteps: 3,
        prompt: "Enter the email",
        value: state.email || "",
        placeholder: "john.smith@myorg.com",
        validate: validateEmail,
        shouldResume: shouldResume,
    });
}
export async function getUserProfile(fromStatusBar: boolean = false): Promise<{ profile: Profile; action: Action }> {
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
            let selected = await window.showInformationMessage("No user profiles defined. Do you want to define one now?", "Yes", "No");
            if (selected === "Yes") {
                await commands.executeCommand(Commands.CREATE_USER_PROFILE);
            }
            return {
                profile: emptyProfile,
                action: Action.ShowCreateConfig,
            };
        }
        return {
            profile: emptyProfile,
            action: Action.LoadSilently,
        };
    }

    let selectedProfileFromConfig = profilesInConfig.filter(x => x.selected) || [];

    if (!fromStatusBar) {
        if (selectedProfileFromConfig.length === 0) {
            //if configs found, but none are selected, if from statusbar show picklist else silent
            return {
                profile: emptyProfile,
                action: Action.LoadSilently,
            };
        } else {
            //if multiple items have selected = true (due to manual change) return the first one
            return {
                profile: selectedProfileFromConfig[0],
                action: Action.PickedSelectedFromConfig,
            };
        }
    } else if (fromStatusBar) {
        let response;

        let validWorkSpace = await isValidWorkspace();
        if (validWorkSpace.result === false) {
            window.showErrorMessage(validWorkSpace.message);
            return {
                profile: selectedProfileFromConfig[0],
                action: Action.EscapedPicklist,
            };
        }
        if (selectedProfileFromConfig.length === 0) {
            response = await window.showInformationMessage(`What do you want to do?`, "Pick a profile", "Edit existing", "Create new");
        } else {
            response = await window.showInformationMessage(
                `Do you want to use profile '${selectedProfileFromConfig[0].label}' for this repo?`,
                "Yes, apply",
                "No, pick another",
                "Edit existing",
                "Create new"
            );
        }
        if (response === undefined) {
            return {
                profile: selectedProfileFromConfig[0],
                action: Action.NoOp,
            };
        } else if (response === "Edit existing") {
            await commands.executeCommand(Commands.EDIT_USER_PROFILE);
            return {
                profile: selectedProfileFromConfig[0],
                action: Action.NoOp,
            };
        } else if (response === "Yes, apply") {
            if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
                let folder = workspace.workspaceFolders[0].uri.fsPath;
                await sgit(folder).addConfig("user.name", selectedProfileFromConfig[0].userName);
                await sgit(folder).addConfig("user.email", selectedProfileFromConfig[0].email);
                window.showInformationMessage("User name and email updated in git config file.");
                return {
                    profile: selectedProfileFromConfig[0],
                    action: Action.NoOp,
                };
            }
        } else if (response === "Create new") {
            await commands.executeCommand(Commands.CREATE_USER_PROFILE);
            return {
                profile: selectedProfileFromConfig[0],
                action: Action.NoOp,
            };
        } else if (response === "No, pick another" || response === "Pick a profile") {
            //show picklist only if no profile is marked as selected in config.
            //this can happen only when setting up config for the first time or user deliberately changed config
            let pickedProfile = await window.showQuickPick<Profile>(
                profilesInConfig.map(x => {
                    return {
                        label: `${x.label}${x.selected ? " $(star)" : ""}`,
                        userName: x.userName,
                        email: x.email,
                        selected: x.selected,
                        detail: `${x.userName} (${x.email}) `,
                    };
                }),
                {
                    canPickMany: false,
                    matchOnDetail: false,
                    ignoreFocusOut: true,
                    placeHolder: "Select a user profile. ",
                }
            );

            if (pickedProfile) {
                pickedProfile.detail = undefined;
                pickedProfile.label = pickedProfile.label.replace(" $(star)", "");
                pickedProfile.selected = true;
                saveProfile(Object.assign({}, pickedProfile));
                let selectedProfile = await getUserProfile(true);
                return selectedProfile;
            } else {
                // profile is already set in the statusbar,
                // user clicks statusbar, picklist is shown to switch profiles, but user does not pick anything
                // leave selected as is
                if (selectedProfileFromConfig.length > 0 && fromStatusBar) {
                    return {
                        profile: selectedProfileFromConfig[0],
                        action: Action.EscapedPicklist,
                    };
                }
            }
        }
    }
    return {
        profile: emptyProfile,
        action: Action.NoOp,
    };
}

export async function editUserProfile() {
    let profilesInConfig = getProfiles();

    if (profilesInConfig.length === 0) {
        window.showWarningMessage("No profiles found");
        return;
    }

    let selectedProfileFromConfig = profilesInConfig.filter(x => x.selected) || [];

    let pickedProfile = await window.showQuickPick<Profile>(
        profilesInConfig.map(x => {
            return {
                label: `${x.label}${x.selected ? " $(star)" : ""}`,
                userName: x.userName,
                email: x.email,
                selected: x.selected,
                detail: `${x.userName} (${x.email}) `,
            };
        }),
        {
            canPickMany: false,
            matchOnDetail: false,
            ignoreFocusOut: true,
            placeHolder: "Select a user profile. ",
        }
    );

    if (pickedProfile) {
        pickedProfile.detail = undefined;
        pickedProfile.label = pickedProfile.label.replace(" $(star)", "");
        const state: Partial<State> = {
            email: pickedProfile.email,
            userName: pickedProfile.userName,
            profileName: pickedProfile.label,
        };
        await MultiStepInput.run(input => pickProfileName(input, state, false));

        let profile: Profile = {
            label: state.profileName || "",
            email: state.email || "",
            userName: state.userName || "",
            selected: pickedProfile.selected,
        };

        saveProfile(profile, pickedProfile.label);
    } else {
        //TODO: profile is already selected, user decides to edit and then cancels action
    }
}
