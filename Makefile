SHELL := /bin/bash
RBENV_INIT := export PATH="$$HOME/.rbenv/shims:$$HOME/.rbenv/bin:$$PATH" && eval "$$(rbenv init -)" &&

.PHONY: help serve build clean install test

help:
	@echo "Comandos disponíveis:"
	@echo "  make serve     - Roda o servidor de desenvolvimento"
	@echo "  make build     - Gera o site estático"
	@echo "  make clean     - Limpa arquivos temporários"
	@echo "  make install   - Instala dependências"
	@echo "  make test      - Testa o site"
	@echo "  make help      - Mostra esta ajuda"

serve:
	@echo "Iniciando servidor de desenvolvimento..."
	@echo "Acesse: http://localhost:4000"
	@echo "Para parar: Ctrl+C"
	@$(RBENV_INIT) bundle exec jekyll serve --host 0.0.0.0 --port 4000

build:
	@echo "Gerando site estatico..."
	@$(RBENV_INIT) bundle exec jekyll build
	@echo "Site gerado em _site/"

clean:
	@echo "Limpando arquivos temporarios..."
	rm -rf _site/
	rm -rf .jekyll-cache/
	rm -rf .sass-cache/
	@echo "Limpeza concluida"

install:
	@echo "Instalando dependencias..."
	@$(RBENV_INIT) bundle install
	@echo "Dependencias instaladas"

test:
	@echo "Testando o site..."
	@$(RBENV_INIT) bundle exec jekyll build --verbose
	@echo "Site testado com sucesso"

dev: clean serve

prod: clean build
	@echo "🚀 Site pronto para produção em _site/"
