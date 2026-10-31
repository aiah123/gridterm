# Gridterm: load the user's ~/.zlogin (or $ZDOTDIR/.zlogin) first.
_gt_zdotdir=$ZDOTDIR
ZDOTDIR=${GRIDTERM_USER_ZDOTDIR:-$HOME}
[[ -r $ZDOTDIR/.zlogin ]] && builtin source $ZDOTDIR/.zlogin
GRIDTERM_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_gt_zdotdir
unset _gt_zdotdir

_gt_restore_zdotdir
