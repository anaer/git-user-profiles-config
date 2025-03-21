import { basename } from "path";
import sgit from "simple-git";
import { commands, window, workspace, WorkspaceFolder } from "vscode";
import { getVscProfiles, saveVscProfile, getVscProfile, getVscSelectedProfile, getVscSelectedProfileLabel } from "./config";
import * as constants from "./constants";
import * as controls from "./controls";
import { Profile } from "./models";
import * as util from "./util";
import { Logger } from "./util/logger";

export async function createUserProfile() {
  const state = {} as Partial<controls.State>;
  await controls.MultiStepInput.run((input) => pickProfileName(input, state));

  const profile: Profile = {
    label: state.profileName || "",
    email: state.email || "",
    userName: state.userName || "",
    selected: false,
  };

  await saveVscProfile(profile);
}

function shouldResume() {
  // Could show a notification with the option to resume.
  return new Promise<boolean>(() => {});
}

async function pickProfileName(input: controls.MultiStepInput, state: Partial<controls.State>, create = true) {
  state.profileName = await input.showInputBox({
    title: create ? "Create a profile" : "Edit profile",
    step: 1,
    totalSteps: 3,
    prompt: "Enter name for the profile",
    value: state.profileName || "",
    placeholder: "Work",
    validate: (input) => util.validateProfileName(input, create),
    shouldResume: shouldResume,
    ignoreFocusOut: true,
  });
  return (input: controls.MultiStepInput) => pickUserName(input, state, create);
}

async function pickUserName(input: controls.MultiStepInput, state: Partial<controls.State>, create = true) {
  state.userName = await input.showInputBox({
    title: create ? "Create a profile" : "Edit profile",
    step: 2,
    totalSteps: 3,
    prompt: "Enter the user name",
    value: state.userName || "",
    placeholder: "John Smith",
    validate: util.validateUserName,
    shouldResume: shouldResume,
    ignoreFocusOut: true,
  });
  return (input: controls.MultiStepInput) => pickEmail(input, state, create);
}

async function pickEmail(input: controls.MultiStepInput, state: Partial<controls.State>, create = true) {
  state.email = await input.showInputBox({
    title: create ? "Create a profile" : "Edit profile",
    step: 3,
    totalSteps: 3,
    prompt: "Enter the email",
    value: state.email || "",
    placeholder: "john.smith@myorg.com",
    validate: util.validateEmail,
    shouldResume: shouldResume,
    ignoreFocusOut: true,
  });
}

/**
 * Get current saved profile & Switch between profiles & Apply profile
 * @description **The use of the parameters is just my personal assumption !** — *Shaokun-X*
 * @param fromStatusBar if the function is called from sidebar or not
 * @param notProfileSwitch when has selected profile and want to select new one
 */
export async function getUserProfile(fromStatusBar = false, notProfileSwitch = true): Promise<Profile> {
  Logger.instance.logInfo(`Getting user profiles. Triggered from status bar = ${fromStatusBar}, not profile switch = ${notProfileSwitch}`);
  const vscProfiles = getVscProfiles();
  const emptyProfile: Profile = {
    label: constants.Application.APPLICATION_NAME,
    selected: false,
    email: "NA",
    userName: "NA",
  };

  const defaultProfiles = vscProfiles.filter((x) => x.selected) || [];
  const selectedProfile: Profile = getVscSelectedProfile() || (defaultProfiles.length > 0 ? defaultProfiles[0] : emptyProfile);

  Logger.instance.logInfo(`Selected VSC profile: '${util.trimLabelIcons(selectedProfile.label)}'`);

  // Validate profile properties
  if (!selectedProfile.label || !selectedProfile.userName || !selectedProfile.email) {
    window.showErrorMessage("One of label, userName or email properties is missing in the config. Please verify.");
    return emptyProfile;
  }

  const validatedWorkspace = await util.isValidWorkspace();
  const workspaceFolder = validatedWorkspace.folder || ".\\";

  let configInSync = false;
  const currentGitConfig = await util.getCurrentGitConfig(workspaceFolder);
  if (validatedWorkspace.isValid) {
    configInSync = !util.isNameAndEmailEmpty(currentGitConfig) && util.hasSameNameAndEmail(currentGitConfig, selectedProfile);
  }

  if (!fromStatusBar) {
    if (!configInSync) {
      const matchingProfile = vscProfiles.find((profile) => util.hasSameNameAndEmail(profile, currentGitConfig));
      if (matchingProfile) {
        return matchingProfile;
      }

      if (workspace.workspaceFolders?.length === 1) {
        const sameLabelProfile = getVscProfile(selectedProfile.label);
        if (sameLabelProfile) {
          updateGitConfig(workspaceFolder, sameLabelProfile);
          // window.showInformationMessage("User name and email auto-updated in git config file.");
          return sameLabelProfile;
        }
      }
    }

    if (vscProfiles.length === 0 || !validatedWorkspace.isValid) {
      return emptyProfile;
    }
    return selectedProfile;
  }

  if (vscProfiles.length === 0) {
    const selected = await window.showInformationMessage("No user profiles defined. Do you want to define one now?", "Yes", "No");
    if (selected === "Yes") {
      await commands.executeCommand(constants.CommandIds.CREATE_USER_PROFILE);
    }
    return emptyProfile;
  }

  let response;
  if (!validatedWorkspace.isValid) {
    window.showErrorMessage(validatedWorkspace.message);
    return emptyProfile;
  }

  if (defaultProfiles.length === 0) {
    response = await window.showInformationMessage(
      `You have ${vscProfiles.length} profile(s) in settings. What do you want to do?`,
      "Pick a profile",
      "Edit existing",
      "Create new"
    );
  } else if (notProfileSwitch) {
    const options = configInSync
      ? ["Apply again", "Pick a profile", "Edit existing", "Create new"]
      : ["Yes, apply", "No, pick another", "Edit existing", "Create new"];
    const message = configInSync
      ? `Repo '${basename(workspaceFolder)}' is already using user details from the profile '${util.trimLabelIcons(selectedProfile.label)}'. What do you want to do?`
      : `You have selected profile '${util.trimLabelIcons(selectedProfile.label)}', but the repo '${basename(workspaceFolder)}' is not using user details from this profile. Do you want to apply the user details from profile '${util.trimLabelIcons(selectedProfile.label)}'?`;

    response = await window.showInformationMessage(message, ...options);
  }

  if (!response) {
    return selectedProfile;
  }

  switch (response) {
    case "Edit existing":
      await editUserProfile();
      break;
    case "Yes, apply":
    case "Apply again":
      updateGitConfig(workspaceFolder, selectedProfile);
      window.showInformationMessage("User name and email updated in git config file.");
      break;
    case "Create new":
      await createUserProfile();
      break;
    case "No, pick another":
    case "Pick a profile":
      const pickedProfile = await window.showQuickPick<Profile>(
        vscProfiles.map((x) => ({
          label: x.label,
          userName: x.userName,
          email: x.email,
          selected: x.selected,
          detail: `${x.userName} (${x.email}) `,
        })),
        {
          canPickMany: false,
          matchOnDetail: false,
          ignoreFocusOut: true,
          placeHolder: "Select a user profile.",
        }
      );

      if (pickedProfile) {
        await saveVscProfile({ ...pickedProfile });
        const selectedProfile = await getUserProfile(true, false);
        updateGitConfig(workspaceFolder, selectedProfile);
        window.showInformationMessage("User name and email updated in git config file.");
        return selectedProfile;
      }
      break;
  }

  return selectedProfile;
}

export async function editUserProfile() {
  const profilesInConfig = getVscProfiles();

  if (profilesInConfig.length === 0) {
    window.showWarningMessage("No profiles found");
    return;
  }

  const pickedProfile = await window.showQuickPick<Profile>(
    profilesInConfig.map((x) => {
      return {
        label: util.trimLabelIcons(x.label),
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
    pickedProfile.label = pickedProfile.label;
    const state: Partial<controls.State> = {
      email: pickedProfile.email,
      userName: pickedProfile.userName,
      profileName: pickedProfile.label,
    };
    await controls.MultiStepInput.run((input) => pickProfileName(input, state, false));

    const profile: Profile = {
      label: state.profileName || "",
      email: state.email || "",
      userName: state.userName || "",
      selected: pickedProfile.selected,
    };

    await saveVscProfile(profile, pickedProfile.label);
  }
  return undefined;
}

/**
 * Read local git `config` and update the profiles in VSC config. If git config profile exists,
 * only the corresponding profile in VSC config would be set `selected = true`. If git config profile
 * doesn't have corresponding profile in VSC config, then it would be added.
 * @returns local git config profile if exists, otherwise an object with `userName` and `email` are empty string.
 */
export async function syncVscProfilesWithGitConfig(): Promise<void> {
  const validatedWorkspace = await util.isValidWorkspace();
  if (!validatedWorkspace.isValid || !validatedWorkspace.folder) {
    return;
  }

  const gitProfile = await util.getCurrentGitConfig(validatedWorkspace.folder);
  const vscProfiles = getVscProfiles();
  const vscSelectedProfileLabel = getVscSelectedProfileLabel();

  if (util.isNameAndEmailEmpty(gitProfile)) {
    if (vscProfiles.length > 0) {
      const selectedProfile = getVscSelectedProfile() || vscProfiles.find((x) => x.selected) || vscProfiles[0];
      await updateGitConfig(validatedWorkspace.folder, selectedProfile);
      window.showInformationMessage("Local Git config unset user info. Auto-synced profile from VSC config.");
    } else {
      const response = await window.showInformationMessage(
        `No user details found in git config of the repo '${basename(validatedWorkspace.folder)}'. Do you want to create a new user detail profile now?`,
        "Yes",
        "No"
      );
      if (response === "Yes") {
        await createUserProfile();
      }
    }
    return;
  }

  if (vscSelectedProfileLabel) {
    const selectedProfile = getVscProfile(vscSelectedProfileLabel);
    if (selectedProfile) {
      if (util.hasSameNameAndEmail(selectedProfile, gitProfile)) {
        return;
      } else {
        await updateGitConfig(validatedWorkspace.folder, selectedProfile);
        return;
      }
    } else {
      const newProfile: Profile = {
        label: vscSelectedProfileLabel,
        userName: gitProfile.userName,
        email: gitProfile.email,
        selected: false,
      };
      await saveVscProfile(newProfile);
      return;
    }
  }

  const matchingProfile = vscProfiles.find((profile) => util.hasSameNameAndEmail(profile, gitProfile));
  if (matchingProfile) {
    await saveVscProfile(matchingProfile);
  } else {
    const matchingLabelProfile = vscProfiles.find((profile) => profile.label.toLowerCase() === gitProfile.userName.toLowerCase());
    if (matchingLabelProfile) {
      await saveVscProfile(matchingLabelProfile);
    } else {
      const newProfile: Profile = {
        label: util.trimLabelIcons(gitProfile.userName),
        userName: gitProfile.userName,
        email: gitProfile.email,
        selected: true,
      };
      await saveVscProfile(newProfile);
    }
  }
}

async function updateGitConfig(folder: string, profile: Profile): Promise<void> {
  await sgit(folder).addConfig("user.name", profile.userName);
  await sgit(folder).addConfig("user.email", profile.email);
}
