export const releaseWorkflowJobs = Object.freeze([
  Object.freeze({ id: 'windows-package', name: 'Build unsigned Squirrel.Windows release files', runner: 'windows-2025' }),
  Object.freeze({ id: 'linux-container', name: 'Build deterministic OCI container archive', runner: 'ubuntu-24.04' }),
  Object.freeze({ id: 'publish-release', name: 'Publish one verified release', runner: 'ubuntu-24.04' }),
  Object.freeze({ id: 'finalize-release', name: 'Finalize release readback', runner: 'ubuntu-24.04' })
]);

export const releaseWorkflowJobNames = Object.freeze(releaseWorkflowJobs.map((job) => job.name));
