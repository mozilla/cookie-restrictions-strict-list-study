/* globals ExtensionAPI */

Cu.importGlobalProperties(["fetch"]);

ChromeUtils.defineModuleGetter(this, "Services",
  "resource://gre/modules/Services.jsm");
ChromeUtils.defineModuleGetter(this, "ExtensionCommon",
  "resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.defineModuleGetter(this, "AddonManager",
  "resource://gre/modules/AddonManager.jsm");
ChromeUtils.defineModuleGetter(this, "Preferences",
  "resource://gre/modules/Preferences.jsm");
const DefaultPreferences = new Preferences({ defaultBranch: true });


let gExtension;

this.multipreffer = class extends ExtensionAPI {
  getAPI(context) {
    gExtension = context.extension;
    return {
      multipreffer: {
        async studyReady(studyInfo) {
          await FirefoxHooks.studyReady(studyInfo);
        },
      },
    };
  }
};

this.FirefoxHooks = {
  _oldDefaultValues: {},
  async studyReady(studyInfo) {
    // Called every time the add-on is loaded.
    try {
      const res = await fetch(gExtension.getURL("variations.json"));
      this.variations = await res.json();
    } catch (e) {
      console.error("Failed to load variations!");
      return;
    }

    const variationName =
      Preferences.get(
        "extensions.multipreffer.test.variationName", studyInfo.variation.name);
    const prefs = this.variations[variationName].prefs;

    for (const pref of Object.keys(prefs)) {
      let val = Preferences.get(pref);
      if (val === undefined) {
        // If undefined, save it as an empty string.
        // This is the best we can do to reset it at cleanup
        // since there's no way to clear the value of a pref
        // on the default branch.
        val = "";
      }
      this._oldDefaultValues[pref] = val;
    }

    DefaultPreferences.set(prefs);
    this.recomputeCategoryPref();
    AddonManager.addAddonListener(this);
  },

  cleanup() {
    // Called when the add-on is being removed for any reason.
    DefaultPreferences.set(this._oldDefaultValues);
    this.recomputeCategoryPref();
  },

  recomputeCategoryPref() {
    // BrowserGlue will recompute the category pref when the cookie behavior
    // pref changes value, but only if the category pref is unset. So, we
    // need to change the cookie behavior pref, which will recompute the
    // category pref. Then, clear the newly recomputed category pref, and
    // finally restore the cookie behavior pref again which will recompute
    // the category pref in the correct state.
    const cookieBehaviorValue =
      Preferences.get("network.cookie.cookieBehavior");
    const tempCookieBehaviorValue = cookieBehaviorValue === 4 ? 0 : 4;
    Preferences.set("network.cookie.cookieBehavior", tempCookieBehaviorValue);
    Preferences.reset("browser.contentblocking.category");
    Preferences.set("network.cookie.cookieBehavior", cookieBehaviorValue);
  },

  onUninstalling(addon) {
    this.handleDisableOrUninstall(addon);
  },

  onDisabled(addon) {
    this.handleDisableOrUninstall(addon);
  },

  async handleDisableOrUninstall(addon) {
    if (addon.id !== gExtension.id) {
      return;
    }
    this.cleanup();
    AddonManager.removeAddonListener(this);
    // This is needed even for onUninstalling, because it nukes the addon
    // from UI. If we don't do this, the user has a chance to "undo".
    addon.uninstall();
  },
};
