//go:build js && wasm

package main

import (
	"encoding/json"
	"syscall/js"

	"github.com/alecthomas/chroma/v2"
	"github.com/alecthomas/chroma/v2/lexers"
)

type token struct {
	Text  string `json:"text"`
	Class string `json:"class"`
}

type result struct {
	Tokens      []token `json:"tokens"`
	Highlighted bool    `json:"highlighted"`
	Error       string  `json:"error,omitempty"`
}

func highlight(_ js.Value, args []js.Value) any {
	language, source := args[0].String(), args[1].String()
	lexer := lexers.Get(language)
	highlighted := language != "" && lexer != nil
	if language == "" || lexer == nil {
		lexer = lexers.Fallback
	}
	iterator, err := chroma.Coalesce(lexer).Tokenise(nil, source)
	tokens := make([]token, 0)
	for err == nil {
		t := iterator()
		if t == chroma.EOF {
			break
		}
		class := ""
		for kind := t.Type; ; kind = kind.Parent() {
			if value, ok := chroma.StandardTypes[kind]; ok {
				class = value
				break
			}
			if kind == 0 {
				break
			}
		}
		tokens = append(tokens, token{Text: t.Value, Class: class})
	}
	response := result{Tokens: tokens, Highlighted: highlighted}
	if err != nil {
		response.Error = err.Error()
	}
	data, marshalErr := json.Marshal(response)
	if marshalErr != nil {
		return marshalErr.Error()
	}
	return string(data)
}

func main() {
	callback := js.FuncOf(highlight)
	js.Global().Set("highlightChroma", callback)
	select {}
}
