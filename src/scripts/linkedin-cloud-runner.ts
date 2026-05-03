import { startLinkedInCloudRunner } from "../services/linkedinCloudRunner.service.js";

startLinkedInCloudRunner().catch((error) => {
  console.error("LinkedIn cloud runner failed to start:", error);
  process.exit(1);
});
