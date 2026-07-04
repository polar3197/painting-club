import React from 'react';
import { TextInput as RNTextInput, TextInputProps } from 'react-native';

// App-wide TextInput. Autocorrect + the iOS QuickType suggestion bar are forced
// OFF for every input in the app. React 19 dropped function-component
// `defaultProps`, and RN's `TextInput` export is a getter (Metro's ESM interop
// makes monkey-patching unreliable), so the whole app routes through this
// wrapper instead. `autoCorrect`/`spellCheck` come AFTER {...props} so nothing
// can re-enable the suggestion bar.
const TextInput = React.forwardRef<any, TextInputProps>((props, ref) => (
  <RNTextInput
    ref={ref}
    autoComplete="off"
    {...props}
    autoCorrect={false}
    spellCheck={false}
  />
));

TextInput.displayName = 'TextInput';

export { TextInput };
export default TextInput;
