export function onStoryDown(cleanFn: () => void) {
  const storyRoot = document.getElementById("storybook-root");
  if (storyRoot) {
    // Create an observer instance linked to the callback function
    const observer = new MutationObserver((_records, observer) => {
      cleanFn();
      observer.disconnect();
    });
    // Start observing the target node for configured mutations
    observer.observe(storyRoot, { childList: true });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapStory<T extends Record<string, any>>(story: (args: T) => void | (() => void)) {
  return ({ args }: { args: T }) => {
    const cleanFn = story(args);
    if (cleanFn) onStoryDown(cleanFn);
  };
}
