// Package snagcli holds the files shipped inside the Go binary.
package snagcli

import "embed"

// Skills are the agent skills that `snag setup` installs.
//
//go:embed snag/skills
var Skills embed.FS
