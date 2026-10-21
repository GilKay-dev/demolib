Use only when cloning this template to start a new project. If the project already has files or folders beyond `.claude/commands`, `.gitignore` and `README.md`, warn the user not to run this command.
Process:
Remove old project git info.
Initialize git for the new project.
Add current files and folders to the new project.
Commit the changes.
Push to remote (need the remote URL; if none, ask the user; default branch name is main unless specified).