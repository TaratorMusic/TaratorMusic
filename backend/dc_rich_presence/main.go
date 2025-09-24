package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/Victiniiiii/rp"
	"github.com/Victiniiiii/rp/rpc"
)

var RPC *rpc.Client

type Message struct {
	Status string `json:"status"`
}

func sendStatus(status string) {
	msg := Message{Status: status}
	data, _ := json.Marshal(msg)
	fmt.Println(string(data))
	os.Stdout.Sync()
}

func createRPC(clientID string) {
	if RPC != nil {
		sendStatus("online")
		return
	}

	var err error
	RPC, err = rp.NewClient(clientID)
	if err != nil {
		sendStatus("error")
		return
	}
	sendStatus("online")
}

func destroyRPC() {
	if RPC != nil {
		RPC.ResetActivity()
		RPC = nil
	}
	sendStatus("disabled")
}

func updateDiscordPresence(songName, artistName string, currentSec, totalSec int, paused, idle bool) {
	if RPC == nil {
		sendStatus("disabled")
		return
	}

	now := time.Now()
	activity := &rpc.Activity{
		LargeImage: "tarator1024_icon",
	}

	if idle || songName == "" {
		activity.Details = "Browsing Music"
		activity.State = "Idle"
	} else {
		activity.Details = songName
		if paused {
			if artistName != "" {
				activity.State = "⏸ Paused • by " + artistName
			} else {
				activity.State = "⏸ Paused"
			}
		} else if totalSec > 0 {
			if currentSec > totalSec {
				currentSec = totalSec
			}
			startTime := now.Add(-time.Duration(currentSec) * time.Second)
			endTime := startTime.Add(time.Duration(totalSec) * time.Second)

			if artistName != "" {
				activity.State = "by " + artistName
			} else {
				activity.State = "──────────────────────────"
			}
			activity.Timestamps = &rpc.Timestamps{
				Start: &startTime,
				End:   &endTime,
			}
		}
	}

	if err := RPC.SetActivity(activity); err != nil {
		sendStatus("error")
		return
	}
	sendStatus("online")
}

func handleCommand(command string, args []string, clientID string) {
	switch command {
	case "create":
		createRPC(clientID)
		updateDiscordPresence("", "", 0, 0, false, true)
	case "destroy":
		destroyRPC()
	case "update":
		if len(args) < 6 {
			sendStatus("error")
			return
		}
		songName := args[0]
		artistName := args[1]
		currentSec, _ := strconv.Atoi(args[2])
		totalSec, _ := strconv.Atoi(args[3])
		paused, _ := strconv.ParseBool(args[4])
		idle, _ := strconv.ParseBool(args[5])
		updateDiscordPresence(songName, artistName, currentSec, totalSec, paused, idle)
	case "quit":
		destroyRPC()
		os.Exit(0)
	default:
		sendStatus("error")
	}
}

func main() {
	clientID := "1258898699816275969"
	if len(os.Args) > 1 {
		command := os.Args[1]
		if command != "daemon" {
			handleCommand(command, os.Args[2:], clientID)
			return
		}
	}

	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) == 0 {
			continue
		}

		command := parts[0]
		var args []string
		if command == "update" && len(parts) >= 6 {
			dataString := strings.Join(parts[1:len(parts)-4], " ")

			dataParts := strings.Split(dataString, "|||")

			var songName, artistName string
			if len(dataParts) >= 2 {
				songName = strings.TrimSpace(dataParts[0])
				artistName = strings.TrimSpace(dataParts[1])
			} else {
				songName = strings.TrimSpace(dataParts[0])
				artistName = ""
			}

			lastFour := parts[len(parts)-4:]

			args = []string{songName, artistName, lastFour[0], lastFour[1], lastFour[2], lastFour[3]}
		} else {
			args = parts[1:]
		}

		handleCommand(command, args, clientID)
	}
}
