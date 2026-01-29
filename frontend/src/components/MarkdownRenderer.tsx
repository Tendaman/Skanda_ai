"use client";

import React, { useEffect, useRef } from "react";
import parse, { HTMLReactParserOptions, Element, domToReact, DOMNode } from "html-react-parser";
import hljs from "highlight.js";

import "highlight.js/styles/github.css";

type Props = { content: string };

export default function MarkdownRenderer({ content }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (containerRef.current) {
      const timer = setTimeout(() => {
        containerRef.current?.querySelectorAll('pre code, code').forEach((codeBlock) => {
          hljs.highlightElement(codeBlock as HTMLElement);
        });
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, [content]);

  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        const attribs = { ...domNode.attribs };
        
        if (attribs.class) {
          attribs.className = attribs.class;
          delete attribs.class;
        }
        
        const children = Array.isArray(domNode.children) 
          ? domNode.children.filter((child): child is DOMNode => 
              child && typeof child === 'object' && 'type' in child
            )
          : [];
        
        const getTextContent = (node: any): string => {
          if (!node) return '';
          if (node.type === 'text') return node.data || '';
          if (node.name === 'br') return '\n';
          if (node.children) {
            return (node.children as any[]).map(getTextContent).join('');
          }
          return '';
        };

        const extractLanguage = (className?: string): string => {
          if (!className) return 'plaintext';
          const match = className.match(/language-(\w+)/);
          return match ? match[1] : 'plaintext';
        };
        
        switch (domNode.name) {
          case 'pre':
            const codeElement = domNode.children.find(
              (child): child is Element => child instanceof Element && child.name === 'code'
            );
            
            if (codeElement) {
              const className = codeElement.attribs?.class || '';
              const language = extractLanguage(className);
              const codeText = getTextContent(codeElement);

              return (
                <div className="my-4 rounded-lg overflow-hidden border border-blue-200 bg-gray-50">
                  <div className={`px-4 py-2 text-xs font-mono border-b flex justify-between items-center`}>
                    <span>{language}</span>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(codeText);
                      }}
                      className="text-xs hover:opacity-80 transition-opacity"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <pre className="overflow-x-auto bg-transparent whitespace-pre m-0">
                    <code className={className}>
                      {codeText}
                    </code>
                  </pre>
                </div>
              );
            }
            break;
            
          case 'code':
            const codeAttribs = { ...attribs };
            const codeClassName = codeAttribs.className || '';
            
            // Ensure code blocks have a language class for highlighting
            if (!codeClassName.includes('language-')) {
              codeAttribs.className = codeClassName 
                ? `${codeClassName} language-plaintext`
                : 'language-plaintext';
            }
            return (
              <code {...codeAttribs}>
                {domToReact(children, options)}
              </code>
            );
            
          case 'a':
            // Ensure links open in new tab
            attribs.target = '_blank';
            attribs.rel = 'noopener noreferrer';
            return (
              <a {...attribs}>
                {domToReact(children, options)}
              </a>
            );
            
          case 'ul':
            // Add proper styling for unordered lists with bullet points
            attribs.className = attribs.className 
              ? `${attribs.className} my-4 pl-6 list-disc list-outside`
              : 'my-4 pl-6 list-disc list-outside';
            return (
              <ul {...attribs}>
                {domToReact(children, options)}
              </ul>
            );
            
          case 'ol':
            // Add proper styling for ordered lists with numbers
            attribs.className = attribs.className 
              ? `${attribs.className} my-4 pl-6 list-decimal list-outside`
              : 'my-4 pl-6 list-decimal list-outside';
            return (
              <ol {...attribs}>
                {domToReact(children, options)}
              </ol>
            );
            
          case 'li':
            attribs.className = attribs.className 
              ? `${attribs.className} my-1 pl-1`
              : 'my-1 pl-1';
            return (
              <li {...attribs}>
                {domToReact(children, options)}
              </li>
            );
            
          case 'h1':
            attribs.className = attribs.className 
              ? `${attribs.className} text-3xl font-bold mt-8 mb-4`
              : 'text-3xl font-bold mt-8 mb-4';
            return (
              <h1 {...attribs}>
                {domToReact(children, options)}
              </h1>
            );
            
          case 'h2':
            attribs.className = attribs.className 
              ? `${attribs.className} text-2xl font-bold mt-6 mb-3`
              : 'text-2xl font-bold mt-6 mb-3';
            return (
              <h2 {...attribs}>
                {domToReact(children, options)}
              </h2>
            );
            
          case 'h3':
            attribs.className = attribs.className 
              ? `${attribs.className} text-xl font-bold mt-4 mb-2`
              : 'text-xl font-bold mt-4 mb-2';
            return (
              <h3 {...attribs}>
                {domToReact(children, options)}
              </h3>
            );
            
          case 'h4':
            attribs.className = attribs.className 
              ? `${attribs.className} text-lg font-bold mt-3 mb-2`
              : 'text-lg font-bold mt-3 mb-2';
            return (
              <h4 {...attribs}>
                {domToReact(children, options)}
              </h4>
            );
            
          case 'p':
            attribs.className = attribs.className 
              ? `${attribs.className} my-3`
              : 'my-3';
            return (
              <p {...attribs}>
                {domToReact(children, options)}
              </p>
            );
            
          case 'table':
            attribs.className = attribs.className 
              ? `${attribs.className} border-collapse border border-gray-300 my-4`
              : 'border-collapse border border-gray-300 my-4';
            return (
              <table {...attribs}>
                {domToReact(children, options)}
              </table>
            );
            
          case 'tr':
            return (
              <tr {...attribs}>
                {domToReact(children, options)}
              </tr>
            );
            
          case 'td':
          case 'th':
            attribs.className = attribs.className 
              ? `${attribs.className} border border-gray-300 px-4 py-2`
              : 'border border-gray-300 px-4 py-2';
            return React.createElement(
              domNode.name,
              attribs,
              domToReact(children, options)
            );
            
          case 'b':
          case 'strong':
            attribs.className = attribs.className 
              ? `${attribs.className} font-bold`
              : 'font-bold';
            return (
              <strong {...attribs}>
                {domToReact(children, options)}
              </strong>
            );
            
          case 'i':
          case 'em':
            attribs.className = attribs.className 
              ? `${attribs.className} italic`
              : 'italic';
            return (
              <em {...attribs}>
                {domToReact(children, options)}
              </em>
            );
            
          case 'u':
            attribs.className = attribs.className 
              ? `${attribs.className} underline`
              : 'underline';
            return (
              <u {...attribs}>
                {domToReact(children, options)}
              </u>
            );
            
          case 'br':
            return <br {...attribs} />;
            
          default:
            // For all other HTML elements, use JSX syntax
            return React.createElement(
              domNode.name,
              attribs,
              domToReact(children, options)
            );
        }
      }
      
      return domNode;
    }
  };

  return (
    <div ref={containerRef} className="prose prose-neutral max-w-none">
      {parse(content, options)}
    </div>
  );
}