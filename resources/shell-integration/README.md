# Shell integration

Gridterm injects these scripts into zsh and bash sessions. Your own startup
files are always loaded first; the hooks are added afterwards.

They report events to the terminal with a private escape sequence:

    ESC ] 7770 ; <kind> ; <payload> BEL

| kind | payload | when |
|---|---|---|
| `cwd` | current directory | before each prompt |
| `cmd` | command line as typed | just before a command runs |
| `done` | exit code | when a command finishes |

In payloads, `\` is sent as `\\`, newline as `\n`, ESC as `\e` and BEL as `\a`.

- **zsh:** Gridterm sets `ZDOTDIR` to `zsh/`. Each file there loads your
  matching file first (from your original `ZDOTDIR` or `$HOME`), and the last
  one restores your `ZDOTDIR`.
- **bash:** Gridterm starts `bash --rcfile bash/gridterm.bash -i`. That file
  loads your files the same way a login shell would, then installs the hooks.
  It works with bash 3.2 (macOS's built-in bash) and with bash-preexec.

Set `GRIDTERM_NO_SHELL_INTEGRATION=1` before starting Gridterm to turn it off.
