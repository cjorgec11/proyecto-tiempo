import { initApp } from "./js/controller.js";
import { initFeedback } from "./js/feedback.js";
import { initRouteHistory } from "./js/route-history.js";
import { initAccount } from "./js/account.js";

const accountReady = initAccount();
initApp();
initRouteHistory();
accountReady.then(initFeedback);
